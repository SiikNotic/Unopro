// Wallet ledger: the whole virtual-chip state in one validated object, changed only through pure
// functions. Every bet opens a round with a unique id; a round is paid exactly once (settling an id that
// is no longer open does nothing), so double taps, a second tab or a reload can never pay twice.
//
// Note: this runs in the browser. It protects the game from its own bugs and from accidents, but anyone
// with DevTools can still edit their own chips. Only a server can make the balance authoritative.
import { canRefill, REFILL_CHIPS, STARTING_CHIPS } from './wallet';

export type CasinoGame = 'blackjack' | 'roulette' | 'slots';
export const CASINO_GAMES: CasinoGame[] = ['blackjack', 'roulette', 'slots'];

/** Above this the balance is treated as tampered and clamped. */
export const MAX_BALANCE = 1_000_000_000;
/**
 * Most a round can ever pay back, as a multiple of its stake (stake included):
 * blackjack 2.5× (a natural), roulette 36× (straight up), slots 2500× (five sevens on every line).
 */
export const MAX_PAYOUT_MULTIPLE: Record<CasinoGame, number> = { blackjack: 2.5, roulette: 36, slots: 2500 };
const maxPayout = (game: CasinoGame, stake: number) => Math.floor(stake * MAX_PAYOUT_MULTIPLE[game]);
export const HISTORY_SIZE = 50;
const PAID_MEMORY = 200;
/** Rounds with an unknown payout (a blackjack hand) are closed as lost after this long. */
export const STALE_ROUND_MS = 24 * 60 * 60 * 1000;

export interface OpenRound {
  id: string;
  game: CasinoGame;
  stake: number;
  /** Known up front for roulette and slots (decided at the spin), null for blackjack until it ends. */
  payout: number | null;
  at: number;
}

export interface HistoryEntry {
  id: string;
  game: CasinoGame;
  stake: number;
  payout: number;
  at: number;
}

export interface WalletStats {
  rounds: number;
  wagered: number;
  won: number;
  best: number;
  refills: number;
}

export interface WalletData {
  v: 1;
  balance: number;
  open: OpenRound[];
  history: HistoryEntry[];
  /** Recently settled round ids, so a replayed settle is recognised and ignored. */
  paid: string[];
  stats: WalletStats;
}

const int = (x: unknown, min: number, max: number): number | null =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.floor(x))) : null;
const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 && x.length <= 64 ? x : null);
const game = (x: unknown): CasinoGame | null => (CASINO_GAMES.includes(x as CasinoGame) ? (x as CasinoGame) : null);

export function emptyWallet(balance = STARTING_CHIPS): WalletData {
  return { v: 1, balance, open: [], history: [], paid: [], stats: { rounds: 0, wagered: 0, won: 0, best: 0, refills: 0 } };
}

/** Accepts anything read from storage and returns a valid wallet (unknown or broken fields are dropped). */
export function normalizeWallet(raw: unknown, legacyChips?: unknown): WalletData {
  if (!raw || typeof raw !== 'object') {
    const legacy = int(legacyChips, 0, MAX_BALANCE);
    return emptyWallet(legacy ?? STARTING_CHIPS);
  }
  const r = raw as Record<string, unknown>;
  const w = emptyWallet(int(r.balance, 0, MAX_BALANCE) ?? STARTING_CHIPS);
  const seen = new Set<string>();
  if (Array.isArray(r.open)) {
    for (const o of r.open.slice(0, 20)) {
      if (!o || typeof o !== 'object') continue;
      const x = o as Record<string, unknown>;
      const id = str(x.id);
      const g = game(x.game);
      const stake = int(x.stake, 1, MAX_BALANCE);
      const at = int(x.at, 0, Number.MAX_SAFE_INTEGER);
      if (!id || !g || stake === null || at === null || seen.has(id)) continue;
      const payout = x.payout === null ? null : int(x.payout, 0, maxPayout(g, stake));
      if (payout === null && x.payout !== null) continue;
      seen.add(id);
      w.open.push({ id, game: g, stake, payout, at });
    }
  }
  if (Array.isArray(r.history)) {
    for (const h of r.history.slice(0, HISTORY_SIZE)) {
      if (!h || typeof h !== 'object') continue;
      const x = h as Record<string, unknown>;
      const id = str(x.id);
      const g = game(x.game);
      const stake = int(x.stake, 0, MAX_BALANCE);
      const payout = int(x.payout, 0, MAX_BALANCE);
      const at = int(x.at, 0, Number.MAX_SAFE_INTEGER);
      if (id && g && stake !== null && payout !== null && at !== null) w.history.push({ id, game: g, stake, payout, at });
    }
  }
  if (Array.isArray(r.paid)) w.paid = r.paid.map(str).filter((x): x is string => !!x).slice(-PAID_MEMORY);
  if (r.stats && typeof r.stats === 'object') {
    const s = r.stats as Record<string, unknown>;
    w.stats = {
      rounds: int(s.rounds, 0, Number.MAX_SAFE_INTEGER) ?? 0,
      wagered: int(s.wagered, 0, Number.MAX_SAFE_INTEGER) ?? 0,
      won: int(s.won, 0, Number.MAX_SAFE_INTEGER) ?? 0,
      best: int(s.best, 0, MAX_BALANCE) ?? 0,
      refills: int(s.refills, 0, Number.MAX_SAFE_INTEGER) ?? 0,
    };
  }
  return w;
}

export interface OpenRequest {
  id: string;
  game: CasinoGame;
  stake: number;
  payout: number | null;
  now: number;
}

/** Takes the stake and opens a round. Refuses non-positive, fractional, unaffordable or duplicate bets. */
export function openRound(w: WalletData, req: OpenRequest): { wallet: WalletData; ok: boolean } {
  const stake = req.stake;
  const validStake = Number.isInteger(stake) && stake >= 1 && stake <= w.balance;
  const validPayout = req.payout === null || (Number.isInteger(req.payout) && req.payout >= 0 && req.payout <= maxPayout(req.game, stake));
  const duplicate = w.open.some((o) => o.id === req.id) || w.paid.includes(req.id);
  if (!validStake || !validPayout || duplicate || !str(req.id)) return { wallet: w, ok: false };
  return {
    wallet: { ...w, balance: w.balance - stake, open: [...w.open, { id: req.id, game: req.game, stake, payout: req.payout, at: req.now }] },
    ok: true,
  };
}

/** Adds to the stake of an open round (blackjack double or split). */
export function raiseStake(w: WalletData, id: string, extra: number): { wallet: WalletData; ok: boolean } {
  const round = w.open.find((o) => o.id === id);
  if (!round || round.payout !== null || !Number.isInteger(extra) || extra < 1 || extra > w.balance) return { wallet: w, ok: false };
  return {
    wallet: { ...w, balance: w.balance - extra, open: w.open.map((o) => (o.id === id ? { ...o, stake: o.stake + extra } : o)) },
    ok: true,
  };
}

/**
 * Pays an open round exactly once. The payout decided at open time wins over the one passed here; a
 * blackjack round (payout null) takes the given payout, capped at what the stake could ever return.
 */
export function settleRound(w: WalletData, id: string, payout: number | null, now: number): { wallet: WalletData; credited: number; settled: boolean } {
  const round = w.open.find((o) => o.id === id);
  if (!round) return { wallet: w, credited: 0, settled: false };
  const raw = round.payout ?? payout ?? 0;
  const credited = Math.min(Math.max(0, Math.floor(raw)), maxPayout(round.game, round.stake));
  const entry: HistoryEntry = { id, game: round.game, stake: round.stake, payout: credited, at: now };
  return {
    wallet: {
      ...w,
      balance: Math.min(MAX_BALANCE, w.balance + credited),
      open: w.open.filter((o) => o.id !== id),
      history: [entry, ...w.history].slice(0, HISTORY_SIZE),
      paid: [...w.paid, id].slice(-PAID_MEMORY),
      stats: {
        ...w.stats,
        rounds: w.stats.rounds + 1,
        wagered: w.stats.wagered + round.stake,
        won: w.stats.won + credited,
        best: Math.max(w.stats.best, credited - round.stake),
      },
    },
    credited,
    settled: true,
  };
}

/** A decided round is only recovered once it is clearly no longer animating in some tab. */
export const RECOVER_AFTER_MS = 15_000;

/**
 * After a reload: pays rounds whose result was already decided (a spin interrupted mid-animation) and
 * closes stale rounds with no result as lost. Recent rounds are left alone: another tab may still be
 * showing that spin, and settling it early would reveal the result there.
 */
export function recoverRounds(w: WalletData, now: number): WalletData {
  let next = w;
  for (const round of w.open) {
    const age = now - round.at;
    if (round.payout !== null && age > RECOVER_AFTER_MS) next = settleRound(next, round.id, null, now).wallet;
    else if (round.payout === null && age > STALE_ROUND_MS) next = settleRound(next, round.id, 0, now).wallet;
  }
  return next;
}

/** Free refill, only while the balance can't cover the smallest bet. */
export function refillWallet(w: WalletData): { wallet: WalletData; ok: boolean } {
  if (!canRefill(w.balance)) return { wallet: w, ok: false };
  return { wallet: { ...w, balance: w.balance + REFILL_CHIPS, stats: { ...w.stats, refills: w.stats.refills + 1 } }, ok: true };
}

