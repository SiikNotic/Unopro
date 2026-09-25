// A multiplayer Roulette table (pure; the game-room server drives it). Single zero, the same bets and
// payouts as the solo game. A round: WAITING → BETTING (window after the first bet) → SPINNING (the pocket
// is drawn when bets close; the wheel animates) → RESULT (payouts listed for the server) → next round.
//
// Coins never move here: a slip of bets enters the table only after the server took its total from the
// wallet (addBets), and settle lists what each seat must be paid.
//
// Provably fair (fair.ts): each spin has its own secret 256-bit seed whose SHA-256 is shown before any bet;
// the pocket is HMAC-SHA256(seed, "roulette:pocket:n") mapped without bias onto 0–36, and the seed is revealed
// with the result so anyone can recompute it.
import type { RevealedRound } from './fair';
import { fairInts, isSeed, newSeed, seedHash } from './fair';
import { POCKETS, totalPayout } from '../roulette';
import type { Bet, BetType } from '../roulette';

export const RT_TIMING = { betting: 20000, spin: 7000, result: 7000 };
/** Most coins one player may have on one spin; most bets per slip. */
export const RT_LIMITS = { maxPerRound: 100000, maxBetsPerSlip: 40, maxSlips: 6 };
const BET_TYPES: BetType[] = ['straight', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'column'];

export type RtPhase = 'waiting' | 'betting' | 'spinning' | 'result';

export interface RtSeat {
  seat: string;
  userId: string;
  name: string;
  bets: Bet[];
  slips: number;
  /** Ids of the slips already on the table (a repeated request can't add a slip twice). */
  slipIds: string[];
  total: number;
  payout: number;
  paid: boolean;
}

export interface RtTable {
  kind: 'roulette';
  round: number;
  phase: RtPhase;
  phaseAt: number;
  /** Secret seed of this spin (never in a view before the result). */
  seed: string;
  /** The previous spin, revealed. */
  last: (RevealedRound & { pocket: number }) | null;
  pocket: number | null;
  seats: RtSeat[];
  history: number[];
}

/** The pocket a seed gives. */
export const rtPocket = (seed: string) => fairInts(seed, 'roulette:pocket')(POCKETS);

/** `seed` is a fresh secret seed (newSeed()) for the first spin. */
export function createRtTable(seed: string, now: number): RtTable {
  return { kind: 'roulette', round: 1, phase: 'waiting', phaseAt: now, seed, last: null, pocket: null, seats: [], history: [] };
}

/** Parses an untrusted slip of bets (null if anything is off). */
export function parseSlip(x: unknown): Bet[] | null {
  if (!Array.isArray(x) || x.length === 0 || x.length > RT_LIMITS.maxBetsPerSlip) return null;
  const out: Bet[] = [];
  for (const raw of x) {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    const type = b.type as BetType;
    if (!BET_TYPES.includes(type) || !Number.isInteger(b.amount) || (b.amount as number) < 1 || (b.amount as number) > RT_LIMITS.maxPerRound) return null;
    if (type === 'straight') {
      if (!Number.isInteger(b.value) || (b.value as number) < 0 || (b.value as number) > 36) return null;
      out.push({ type, value: b.value as number, amount: b.amount as number });
    } else if (type === 'dozen' || type === 'column') {
      if (b.value !== 1 && b.value !== 2 && b.value !== 3) return null;
      out.push({ type, value: b.value, amount: b.amount as number });
    } else out.push({ type, amount: b.amount as number });
  }
  return out;
}

export const slipTotal = (bets: Bet[]) => bets.reduce((s, b) => s + b.amount, 0);

export type RtError = 'phase' | 'amount' | 'too_many';

export function canAddBets(t: RtTable, seat: string, bets: Bet[]): RtError | null {
  if (t.phase !== 'waiting' && t.phase !== 'betting') return 'phase';
  const mine = t.seats.find((s) => s.seat === seat);
  if ((mine?.slips ?? 0) >= RT_LIMITS.maxSlips) return 'too_many';
  if ((mine?.total ?? 0) + slipTotal(bets) > RT_LIMITS.maxPerRound) return 'amount';
  return null;
}

/** A slip the server already took from the wallet joins the round. */
export function addBets(t: RtTable, seat: string, userId: string, name: string, bets: Bet[], now: number, slipId = `slip-${slipsOf(t, seat)}`): RtTable {
  const next = structuredClone(t);
  let mine = next.seats.find((s) => s.seat === seat);
  if (!mine) {
    mine = { seat, userId, name, bets: [], slips: 0, slipIds: [], total: 0, payout: 0, paid: false };
    next.seats.push(mine);
    next.seats.sort((a, b) => a.seat.localeCompare(b.seat));
  }
  mine.bets.push(...bets);
  mine.slips += 1;
  mine.slipIds.push(slipId);
  mine.total += slipTotal(bets);
  if (next.phase === 'waiting') {
    next.phase = 'betting';
    next.phaseAt = now;
  }
  return next;
}

/** How many slips this seat has placed this round. */
export const slipsOf = (t: RtTable, seat: string) => t.seats.find((s) => s.seat === seat)?.slips ?? 0;

/** Whether this slip id is already on the table (a retried request). */
export const hasSlip = (t: RtTable, seat: string, slipId: string) => !!t.seats.find((s) => s.seat === seat)?.slipIds.includes(slipId);

export function markPaid(t: RtTable, seat: string): RtTable {
  return { ...t, seats: t.seats.map((s) => (s.seat === seat ? { ...s, paid: true } : s)) };
}

export const unpaid = (t: RtTable) => (t.phase === 'result' ? t.seats.filter((s) => !s.paid && s.payout > 0) : []);

/** Closing bets, the spin, the result and the next round, up to `now` (next round only once all is paid). */
export function advanceRt(table: RtTable, now: number, fresh: () => string = newSeed): RtTable {
  let t = table;
  for (let guard = 0; guard < 20; guard++) {
    if (t.phase === 'betting') {
      const due = t.phaseAt + RT_TIMING.betting;
      if (now < due) break;
      t = { ...t, phase: 'spinning', phaseAt: due, pocket: rtPocket(t.seed) };
      continue;
    }
    if (t.phase === 'spinning') {
      const due = t.phaseAt + RT_TIMING.spin;
      if (now < due) break;
      const pocket = t.pocket!;
      t = {
        ...t,
        phase: 'result',
        phaseAt: due,
        history: [pocket, ...t.history].slice(0, 12),
        seats: t.seats.map((s) => {
          const payout = totalPayout(s.bets, pocket);
          return { ...s, payout, paid: payout === 0 };
        }),
      };
      continue;
    }
    if (t.phase === 'result') {
      if (now < t.phaseAt + RT_TIMING.result || unpaid(t).length) break;
      const last = { round: t.round, seed: t.seed, hash: seedHash(t.seed), pocket: t.pocket! };
      t = { ...t, round: t.round + 1, phase: 'waiting', phaseAt: t.phaseAt + RT_TIMING.result, seed: fresh(), last, pocket: null, seats: [] };
      continue;
    }
    break;
  }
  return t;
}

export interface RtView {
  kind: 'roulette';
  round: number;
  phase: RtPhase;
  phaseAt: number;
  deadline: number | null;
  /** Known to everyone once bets are closed (the wheel animates to it). */
  pocket: number | null;
  seats: { seat: string; name: string; bets: Bet[]; total: number; payout: number }[];
  history: number[];
  limits: typeof RT_LIMITS;
  fair: RtFair;
}

/** The commitment of this spin, and a revealed spin (this one at the result, else the previous one). */
export interface RtFair {
  round: number;
  hash: string;
  revealed: (RevealedRound & { pocket: number }) | null;
}

export function rtFair(t: RtTable): RtFair {
  const hash = seedHash(t.seed);
  const revealed = t.phase === 'result' && t.pocket !== null ? { round: t.round, seed: t.seed, hash, pocket: t.pocket } : t.last;
  return { round: t.round, hash, revealed };
}

/** Checks a revealed spin: the seed matches its commitment and gives that pocket. */
export const verifyRt = (r: RevealedRound & { pocket: number }) => isSeed(r.seed) && seedHash(r.seed) === r.hash && rtPocket(r.seed) === r.pocket;

export function rtTableView(t: RtTable): RtView {
  const deadline = t.phase === 'betting' ? t.phaseAt + RT_TIMING.betting : t.phase === 'spinning' ? t.phaseAt + RT_TIMING.spin : t.phase === 'result' ? t.phaseAt + RT_TIMING.result : null;
  return {
    kind: 'roulette',
    round: t.round,
    phase: t.phase,
    phaseAt: t.phaseAt,
    deadline,
    pocket: t.phase === 'spinning' || t.phase === 'result' ? t.pocket : null,
    seats: t.seats.map((s) => ({ seat: s.seat, name: s.name, bets: s.bets, total: s.total, payout: t.phase === 'result' ? s.payout : 0 })),
    history: t.history,
    limits: RT_LIMITS,
    fair: rtFair(t),
  };
}
