// Premium slot machines: one audited math model (5 reels × 3 rows, 10 fixed lines) shared by every
// themed machine, plus the pieces a server needs to decide a spin. Pure and dependency free, so the same
// file runs in the browser (to check and draw a result) and on the server (to decide it).
import { evaluateSpin, REEL, REELS } from '../slots.ts';
import type { LineWin } from '../slots.ts';

export const MACHINE_IDS = ['lucky7s', 'diamondRoyale', 'goldenFortune', 'inferno', 'tropical', 'pirates', 'cosmic', 'royal'] as const;
export type MachineId = (typeof MACHINE_IDS)[number];
export const isMachineId = (x: unknown): x is MachineId => typeof x === 'string' && (MACHINE_IDS as readonly string[]).includes(x);

/** Every machine plays all 10 lines; the total bet is split evenly across them. */
export const LINE_COUNT = 10;
/** Allowed total bets (multiples of LINE_COUNT, so every line pays whole chips). */
export const BET_LEVELS = [10, 20, 50, 100, 200, 500, 1000] as const;
export const isValidBet = (bet: unknown): bet is number => typeof bet === 'number' && (BET_LEVELS as readonly number[]).includes(bet);
/** Most a single spin can return, as a multiple of the total bet (five top symbols on every line). */
export const MAX_WIN_MULTIPLE = 2500;

export type WinTier = 'none' | 'tiny' | 'small' | 'big' | 'mega' | 'jackpot';

/**
 * How loudly a result is celebrated. A payout that doesn't beat the bet ('tiny') is shown quietly —
 * getting part of your stake back is not a win.
 */
export function tierFor(payout: number, bet: number, jackpot: boolean): WinTier {
  if (jackpot) return 'jackpot';
  if (payout <= 0) return 'none';
  if (payout <= bet) return 'tiny';
  if (payout < bet * 10) return 'small';
  if (payout < bet * 40) return 'big';
  return 'mega';
}

export interface SpinResult {
  stops: number[];
  wins: LineWin[];
  payout: number;
  tier: WinTier;
}

export const isValidStops = (stops: unknown): stops is number[] =>
  Array.isArray(stops) && stops.length === REELS && stops.every((s) => Number.isInteger(s) && s >= 0 && s < REEL.length);

/** The one place a payout is computed from reel positions (browser and server alike). */
export function resolveSpin(stops: number[], bet: number): SpinResult {
  if (!isValidStops(stops) || !isValidBet(bet)) throw new Error('invalid spin');
  const outcome = evaluateSpin(stops, LINE_COUNT, bet / LINE_COUNT);
  return { stops: [...stops], wins: outcome.wins, payout: outcome.total, tier: tierFor(outcome.total, bet, outcome.jackpot) };
}

/**
 * Uniform reel stops from a cryptographic source. Rejection sampling keeps every stop exactly equally
 * likely (a plain modulo would favour the first stops).
 */
export function drawStops(randomUint32: () => number): number[] {
  const n = REEL.length;
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  return Array.from({ length: REELS }, () => {
    for (;;) {
      const x = randomUint32() >>> 0;
      if (x < limit) return x % n;
    }
  });
}

/** crypto.getRandomValues as a uint32 source (browser, Deno and Node 19+). */
export function cryptoUint32(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

export const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRequestId = (x: unknown): x is string => typeof x === 'string' && REQUEST_ID_RE.test(x);
