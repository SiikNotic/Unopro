// A multiplayer Blackjack table (pure; the game-room server drives it). Same rules as the solo game:
// 6 decks, dealer stands on soft 17, blackjack pays 3:2, double on the first two cards, dealer peeks for
// blackjack, no insurance and no split at the shared table.
//
// A round: WAITING (nobody bet yet) → BETTING (window after the first bet, or until every seated player
// bet) → PLAYING (each hand in seat order, with a turn timer; an idle hand stands) → DEALER (one card per
// step) → SETTLED (results shown; payouts are listed for the server to pay) → next round.
//
// Coins never move here: a bet enters the table only after the server has taken it from the wallet
// (placeBet / double receive the id of that debit), and settle() lists what each seat must be paid.
//
// Provably fair (fair.ts): every round has its own secret 256-bit seed whose SHA-256 is shown before any bet.
// The hand is dealt from a fresh 6-deck shoe shuffled with that seed; the seed is revealed once the round is
// settled, with the order the cards left the shoe, so anyone can recompute the shuffle.
import type { PlayingCard } from '../cards';
import { createShoe } from '../cards';
import type { RevealedRound } from './fair';
import { fairShuffle, isSeed, newSeed, seedHash } from './fair';
import { handTotal, isBlackjack, outcomeFor } from '../blackjack';
import type { Hand, Outcome } from '../blackjack';

export const BJ_TIMING = { betting: 15000, turn: 20000, dealerStep: 800, settled: 7000 };
export const BJ_LIMITS = { min: 10, max: 5000 };
const DECKS = 6;

export type BjPhase = 'waiting' | 'betting' | 'playing' | 'dealer' | 'settled';

export interface BjSeat {
  seat: string;
  userId: string;
  name: string;
  bet: number;
  hand: Hand;
  outcome: Outcome | null;
  /** Coins to credit (stake included) once settled. */
  payout: number;
  paid: boolean;
}

export interface BjTable {
  kind: 'blackjack';
  round: number;
  phase: BjPhase;
  /** When the current phase (or the current turn) started, server clock. */
  phaseAt: number;
  /** Secret seed of this round (never in a view until the round is settled). */
  seed: string;
  shoe: PlayingCard[];
  /** Ids of the cards dealt this round, in the order they left the shoe. */
  drawn: string[];
  /** The previous round, revealed. */
  last: (RevealedRound & { drawn: string[] }) | null;
  dealer: PlayingCard[];
  seats: BjSeat[];
  turn: number;
}

/** The shoe of a round: a fresh 6-deck shoe shuffled with the round's seed (cards leave from the end). */
export const bjShoe = (seed: string) => fairShuffle(createShoe(DECKS), seed, 'blackjack:shoe');

/** `seed` is a fresh secret seed (newSeed()) for the first round. */
export function createBjTable(seed: string, now: number): BjTable {
  return { kind: 'blackjack', round: 1, phase: 'waiting', phaseAt: now, seed, shoe: [], drawn: [], last: null, dealer: [], seats: [], turn: 0 };
}

function draw(t: BjTable): PlayingCard {
  // 312 cards always cover one round of at most 6 hands without splits.
  const card = t.shoe.pop()!;
  t.drawn.push(card.id);
  return card;
}

export type BjError = 'phase' | 'already_bet' | 'amount' | 'not_your_turn' | 'cannot_double';

/** Whether this seat may bet now (before the server takes the coins). */
export function canBet(t: BjTable, seat: string, amount: number): BjError | null {
  if (t.phase !== 'waiting' && t.phase !== 'betting') return 'phase';
  if (t.seats.some((s) => s.seat === seat)) return 'already_bet';
  if (!Number.isInteger(amount) || amount < BJ_LIMITS.min || amount > BJ_LIMITS.max) return 'amount';
  return null;
}

/** A bet the server already took from the wallet enters the round. */
export function placeBet(t: BjTable, seat: string, userId: string, name: string, amount: number, now: number): BjTable {
  const next = structuredClone(t);
  next.seats.push({ seat, userId, name, bet: amount, hand: { cards: [], bet: amount, done: false, doubled: false, fromSplit: false }, outcome: null, payout: 0, paid: false });
  next.seats.sort((a, b) => a.seat.localeCompare(b.seat));
  if (next.phase === 'waiting') {
    next.phase = 'betting';
    next.phaseAt = now;
  }
  return next;
}

const current = (t: BjTable) => (t.phase === 'playing' ? t.seats[t.turn] : undefined);

export function canAct(t: BjTable, seat: string, action: 'hit' | 'stand' | 'double'): BjError | null {
  const cur = current(t);
  if (!cur || cur.seat !== seat) return 'not_your_turn';
  if (action === 'double' && (cur.hand.cards.length !== 2 || cur.hand.doubled)) return 'cannot_double';
  return null;
}

/** Moves to the next hand that still has to play, or to the dealer. */
function nextTurn(t: BjTable, now: number) {
  while (t.turn < t.seats.length && t.seats[t.turn].hand.done) t.turn++;
  if (t.turn >= t.seats.length) {
    t.phase = 'dealer';
  }
  t.phaseAt = now;
}

/** hit / stand / double for the seat whose turn it is (double: the server already took the extra stake). */
export function act(t: BjTable, seat: string, action: 'hit' | 'stand' | 'double', now: number): BjTable {
  if (canAct(t, seat, action)) return t;
  const next = structuredClone(t);
  const s = next.seats[next.turn];
  if (action === 'hit') {
    s.hand.cards.push(draw(next));
    const total = handTotal(s.hand.cards).total;
    if (total >= 21) s.hand.done = true;
    else {
      next.phaseAt = now; // a fresh timer after each card
      return next;
    }
  } else if (action === 'double') {
    s.hand.bet *= 2;
    s.bet = s.hand.bet;
    s.hand.doubled = true;
    s.hand.cards.push(draw(next));
    s.hand.done = true;
  } else {
    s.hand.done = true;
  }
  nextTurn(next, now);
  return next;
}

function settle(t: BjTable, now: number) {
  for (const s of t.seats) {
    const r = outcomeFor(s.hand, t.dealer);
    s.outcome = r.outcome;
    s.payout = r.payout;
    s.paid = r.payout === 0;
  }
  t.phase = 'settled';
  t.phaseAt = now;
}

/** Marks a seat's payout as credited to its wallet. */
export function markPaid(t: BjTable, seat: string): BjTable {
  return { ...t, seats: t.seats.map((s) => (s.seat === seat ? { ...s, paid: true } : s)) };
}

export const unpaid = (t: BjTable) => (t.phase === 'settled' ? t.seats.filter((s) => !s.paid && s.payout > 0) : []);

/**
 * Everything that happens on the server's clock up to `now`: closing bets and dealing, idle hands standing,
 * the dealer drawing, settling, and the next round (only once every payout was credited).
 * `present` = seats of the players sitting at the table (the betting window closes early once they all bet).
 */
export function advanceBj(table: BjTable, now: number, present: string[], fresh: () => string = newSeed): BjTable {
  let t = table;
  for (let guard = 0; guard < 80; guard++) {
    if (t.phase === 'betting') {
      const everyoneIn = present.length > 0 && present.every((p) => t.seats.some((s) => s.seat === p));
      const due = t.phaseAt + BJ_TIMING.betting;
      if (!everyoneIn && now < due) break;
      const at = everyoneIn ? Math.min(now, due) : due;
      const next = structuredClone(t);
      next.shoe = bjShoe(next.seed);
      next.drawn = [];
      for (let i = 0; i < 2; i++) {
        for (const s of next.seats) s.hand.cards.push(draw(next));
        next.dealer.push(draw(next));
      }
      for (const s of next.seats) if (isBlackjack(s.hand.cards)) s.hand.done = true;
      if (isBlackjack(next.dealer)) {
        for (const s of next.seats) s.hand.done = true;
        settle(next, at);
      } else {
        next.phase = 'playing';
        next.turn = 0;
        nextTurn(next, at);
      }
      t = next;
      continue;
    }
    if (t.phase === 'playing') {
      const due = t.phaseAt + BJ_TIMING.turn;
      if (now < due) break;
      t = act(t, t.seats[t.turn].seat, 'stand', due);
      continue;
    }
    if (t.phase === 'dealer') {
      const due = t.phaseAt + BJ_TIMING.dealerStep;
      if (now < due) break;
      const next = structuredClone(t);
      const allBust = next.seats.every((s) => handTotal(s.hand.cards).total > 21);
      if (!allBust && handTotal(next.dealer).total < 17) {
        next.dealer.push(draw(next));
        next.phaseAt = due;
      } else settle(next, due);
      t = next;
      continue;
    }
    if (t.phase === 'settled') {
      if (now < t.phaseAt + BJ_TIMING.settled || unpaid(t).length) break;
      const last = { round: t.round, seed: t.seed, hash: seedHash(t.seed), drawn: t.drawn };
      t = { ...t, round: t.round + 1, phase: 'waiting', phaseAt: t.phaseAt + BJ_TIMING.settled, seed: fresh(), shoe: [], drawn: [], last, dealer: [], seats: [], turn: 0 };
      continue;
    }
    break;
  }
  return t;
}

/** What players see: the dealer's hole card stays hidden until the dealer plays; the shoe is never shown. */
export interface BjView {
  kind: 'blackjack';
  round: number;
  phase: BjPhase;
  phaseAt: number;
  deadline: number | null;
  dealer: (PlayingCard | null)[];
  dealerTotal: number | null;
  seats: { seat: string; name: string; bet: number; cards: PlayingCard[]; total: number; soft: boolean; done: boolean; doubled: boolean; outcome: Outcome | null; payout: number }[];
  turn: string | null;
  limits: typeof BJ_LIMITS;
  fair: BjFair;
}

/** The commitment of this round, and a revealed round (this one once settled, else the previous one). */
export interface BjFair {
  round: number;
  hash: string;
  revealed: (RevealedRound & { drawn: string[] }) | null;
}

export function bjFair(t: BjTable): BjFair {
  const hash = seedHash(t.seed);
  const revealed = t.phase === 'settled' ? { round: t.round, seed: t.seed, hash, drawn: t.drawn } : t.last;
  return { round: t.round, hash, revealed };
}

/** Checks a revealed round: the seed matches its commitment and the cards left the shoe in that order. */
export function verifyBj(r: RevealedRound & { drawn: string[] }): boolean {
  if (!isSeed(r.seed) || seedHash(r.seed) !== r.hash) return false;
  const shoe = bjShoe(r.seed);
  return r.drawn.every((id, i) => shoe[shoe.length - 1 - i]?.id === id);
}

export function bjTableView(t: BjTable): BjView {
  const hidden = t.phase === 'betting' || t.phase === 'playing';
  const dealer = hidden ? t.dealer.map((c, i) => (i === 1 ? null : c)) : t.dealer;
  const deadline = t.phase === 'betting' ? t.phaseAt + BJ_TIMING.betting : t.phase === 'playing' ? t.phaseAt + BJ_TIMING.turn : t.phase === 'settled' ? t.phaseAt + BJ_TIMING.settled : null;
  return {
    kind: 'blackjack',
    round: t.round,
    phase: t.phase,
    phaseAt: t.phaseAt,
    deadline,
    dealer,
    dealerTotal: hidden || t.dealer.length === 0 ? (t.dealer[0] ? handTotal([t.dealer[0]]).total : null) : handTotal(t.dealer).total,
    seats: t.seats.map((s) => {
      const { total, soft } = handTotal(s.hand.cards);
      return { seat: s.seat, name: s.name, bet: s.bet, cards: s.hand.cards, total, soft, done: s.hand.done, doubled: s.hand.doubled, outcome: s.outcome, payout: s.payout };
    }),
    turn: current(t)?.seat ?? null,
    limits: BJ_LIMITS,
    fair: bjFair(t),
  };
}
