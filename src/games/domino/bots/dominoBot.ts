// Domino bots. They decide from a DominoView (their own hand + what the whole table can see) and only
// ever pick one of the legal actions the engine listed in that view.
import { createRng, hashSeed } from '@/games/shared/rng';
import type { SeatDriver } from '@/games/shared/multiplayer/types';
import { fits, isDouble, pipsOf } from '../engine/rules';
import type { DominoAction, Pip, Tile } from '../engine/types';
import type { DominoView } from '../engine/view';

export type DominoDifficulty = 'easy' | 'normal' | 'hard';

type Play = Extract<DominoAction, { type: 'PLAY_TILE' }>;

/** Open ends after laying `tile` at `end` (the matching pip disappears, the other one becomes the end). */
function endsAfter(view: DominoView, tile: Tile, end: 'left' | 'right'): [Pip, Pip] {
  if (view.line.length === 0) return [tile.a, tile.b];
  const left = view.line[0].left;
  const right = view.line[view.line.length - 1].right;
  if (end === 'right') return [left, (tile.a === right ? tile.b : tile.a) as Pip];
  return [(tile.a === left ? tile.b : tile.a) as Pip, right];
}

/** How many tiles of each pip are already out of play for me (on the table or in my hand). */
function seenPerPip(view: DominoView): number[] {
  const seen = [0, 0, 0, 0, 0, 0, 0];
  const count = (t: Tile) => {
    seen[t.a]++;
    if (t.b !== t.a) seen[t.b]++;
  };
  view.line.forEach((p) => count(p.tile));
  view.hand.forEach(count);
  return seen;
}

/**
 * Hard/normal scoring of one play. Only public or own information is used:
 * - get rid of heavy tiles and doubles (they are the hardest to place later and cost points if stuck);
 * - keep the ends playable for me (tiles left in my hand that match);
 * - hurt the next player: ends showing pips they already proved they lack;
 * - close suits that are exhausted outside my hand (nobody else can follow them).
 */
function score(view: DominoView, play: Play, level: DominoDifficulty): number {
  const tile = view.hand.find((t) => t.id === play.tileId)!;
  const [l, r] = endsAfter(view, tile, play.end);
  let s = pipsOf(tile) + (isDouble(tile) ? 4 : 0);
  if (level === 'normal') return s;
  const rest = view.hand.filter((t) => t.id !== tile.id);
  s += 2.5 * rest.filter((t) => fits(t, l) || fits(t, r)).length;
  const meIdx = view.seats.findIndex((x) => x.id === view.me);
  const next = view.seats[(meIdx + 1) % view.seats.length];
  if (next.lacks.includes(l)) s += 5;
  if (next.lacks.includes(r)) s += 5;
  const seen = seenPerPip(view);
  for (const pip of [l, r]) {
    const mine = rest.filter((t) => fits(t, pip)).length;
    // Every tile of this pip is accounted for: only I can follow it (control) or nobody can (block).
    if (seen[pip] >= 7) s += mine > 0 ? 3 : rest.length <= view.seats.reduce((m, x) => Math.min(m, x.tiles), 99) ? 4 : 1;
  }
  return s;
}

export function decideDomino(view: DominoView, difficulty: DominoDifficulty, seed: number): DominoAction | null {
  if (view.legal.length === 0) return null;
  const plays = view.legal.filter((a): a is Play => a.type === 'PLAY_TILE');
  if (plays.length === 0) return view.legal[0];
  const rng = createRng(hashSeed(`${seed}|${view.me}|${view.round}|${view.turn}`));
  // Easy: any legal tile. Normal: sometimes (20%) the same; otherwise the heaviest/double.
  if (difficulty === 'easy' || (difficulty === 'normal' && rng.next() < 0.2)) return plays[Math.floor(rng.next() * plays.length)];
  let best = plays[0];
  let bestScore = -Infinity;
  for (const p of plays) {
    const s = score(view, p, difficulty) + rng.next() * 0.01; // seeded tie-break
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

const PACE: Record<DominoDifficulty, [number, number]> = { easy: [600, 900], normal: [750, 1200], hard: [900, 1500] };

/** Seat driver used by the host. `seed` keeps decisions reproducible for a given match. */
export function dominoBotDriver(difficulty: DominoDifficulty, seed: number): SeatDriver<DominoView, DominoAction> {
  return {
    decide(view) {
      const action = decideDomino(view, difficulty, seed);
      if (!action) return null;
      const [lo, hi] = PACE[difficulty];
      const r = createRng(hashSeed(`pace|${seed}|${view.turn}|${view.me}`)).next();
      // Drawing and passing are quick; the next round starts after the result has been read.
      const delayMs = action.type === 'NEXT_ROUND' ? 0 : action.type === 'PLAY_TILE' ? lo + r * (hi - lo) : 520;
      return { action, delayMs };
    },
  };
}
