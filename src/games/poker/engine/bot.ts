// Poker bots. A bot decides from pokerView() only — its two cards and what is public — so it cannot see
// other hands, the deck or the table's seed. It estimates its equity by dealing the unseen cards at random
// many times (Monte Carlo) with its own PRNG, seeded from public facts, and compares it with the price.
import type { PlayingCard } from '@/casino/cards';
import { createShoe } from '@/casino/cards';
import { createRng, hashSeed } from '@/games/shared/rng';
import type { Rng } from '@/games/shared/rng';
import { evaluate, RANK_VALUE } from './evaluate';
import type { PokerAction, PokerView } from './game';

export type PokerDifficulty = 'easy' | 'normal' | 'hard';

interface Profile {
  /** Monte Carlo deals per decision. */
  samples: number;
  /** Noise added to its equity estimate (misreads). */
  noise: number;
  /** How much worse than the price it still calls (loose players call more). */
  looseness: number;
  /** Equity above which it bets / raises for value. */
  valueAt: number;
  /** Chance of a bluff bet when checked to. */
  bluff: number;
}

export const PROFILES: Record<PokerDifficulty, Profile> = {
  easy: { samples: 60, noise: 0.14, looseness: 0.12, valueAt: 0.72, bluff: 0.03 },
  normal: { samples: 140, noise: 0.06, looseness: 0.05, valueAt: 0.62, bluff: 0.08 },
  hard: { samples: 220, noise: 0.02, looseness: 0.0, valueAt: 0.57, bluff: 0.12 },
};

/** Preflop strength (0–1) from the two hole cards: pairs, high cards, suited, connected. */
export function preflopStrength(hole: PlayingCard[]): number {
  const [a, b] = hole.map((c) => RANK_VALUE[c.rank]).sort((x, y) => y - x);
  const pair = a === b;
  let s = pair ? 0.5 + (a - 2) * 0.04 : (a + b - 4) / 48;
  if (!pair && hole[0].suit === hole[1].suit) s += 0.06;
  if (!pair && a - b === 1) s += 0.04;
  if (!pair && a - b >= 5) s -= 0.05;
  return Math.max(0, Math.min(1, s));
}

/** Chance of winning at showdown against `opponents` random hands (ties count half). */
export function estimateEquity(hole: PlayingCard[], board: PlayingCard[], opponents: number, samples: number, rng: Rng): number {
  const known = new Set([...hole, ...board].map((c) => c.id));
  const unseen = createShoe(1).filter((c) => !known.has(c.id));
  let won = 0;
  for (let n = 0; n < samples; n++) {
    // Partial Fisher–Yates: only as many cards as this deal needs.
    const need = 5 - board.length + opponents * 2;
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng.next() * (unseen.length - i));
      [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
    }
    const runout = board.concat(unseen.slice(0, 5 - board.length));
    const mine = evaluate([...hole, ...runout]).score;
    let best = true;
    let tie = false;
    for (let o = 0; o < opponents; o++) {
      const k = 5 - board.length + o * 2;
      const theirs = evaluate([unseen[k], unseen[k + 1], ...runout]).score;
      if (theirs > mine) {
        best = false;
        break;
      }
      if (theirs === mine) tie = true;
    }
    if (best) won += tie ? 0.5 : 1;
  }
  return won / samples;
}

/** The bot's move. `seed` is the bot's own (not the table's); the choice depends only on the view. */
export function decide(view: PokerView, difficulty: PokerDifficulty, seed: number): PokerAction {
  const legal = view.legal;
  if (!legal) return { type: 'check' };
  const prof = PROFILES[difficulty];
  const rng = createRng(hashSeed(`${seed}|${view.handNo}|${view.me}|${view.street}|${view.pot}|${view.currentBet}`));
  const me = view.players.find((p) => p.id === view.me)!;
  const opponents = view.players.filter((p) => p.id !== view.me && !p.folded && !p.out).length;
  const raw = view.board.length === 0 ? preflopStrength(view.hole) * (opponents > 2 ? 0.85 : 1) + 0.1 / Math.max(1, opponents) : estimateEquity(view.hole, view.board, Math.max(1, opponents), prof.samples, rng);
  const equity = Math.max(0, Math.min(1, raw + (rng.next() * 2 - 1) * prof.noise));
  const pot = view.pot;
  const toCall = legal.call;
  const price = toCall > 0 ? toCall / (pot + toCall) : 0;

  const sized = (fraction: number): PokerAction | null => {
    if (!legal.raise) return null;
    const base = legal.raise.kind === 'bet' ? 0 : view.currentBet;
    const to = Math.round(Math.min(legal.raise.max, Math.max(legal.raise.min, base + (pot + toCall) * fraction)));
    if (to >= legal.raise.max && legal.allIn) return { type: 'allIn' };
    return { type: legal.raise.kind, to };
  };

  // Short stack with a strong hand: all in.
  if (legal.allIn && equity > prof.valueAt + 0.08 && me.stack <= pot * 0.6) return { type: 'allIn' };

  if (toCall === 0) {
    if (equity > prof.valueAt) return sized(0.5 + rng.next() * 0.35) ?? { type: 'check' };
    if (rng.next() < prof.bluff) return sized(0.4) ?? { type: 'check' };
    return { type: 'check' };
  }
  if (equity > prof.valueAt + 0.1 && rng.next() < 0.7) {
    const r = sized(0.7 + rng.next() * 0.4);
    if (r) return r;
  }
  if (equity + prof.looseness >= price) return legal.call >= me.stack && legal.allIn ? { type: 'allIn' } : { type: 'call' };
  return legal.fold ? { type: 'fold' } : { type: 'check' };
}
