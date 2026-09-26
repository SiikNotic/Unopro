// CRASH math, the same formulas the database runs (supabase/migrations/20261007000000_crash.sql). The browser
// uses them only to draw the flight and to let a player check a finished round; the database decides.
import { fromHex, hmacSha256, seedHash, toHex } from '@/casino/table/fair';
import type { RevealedRound } from '@/casino/table/fair';

/** Multiplier growth per second of flight: m(t) = e^(0.06·t). */
export const GROWTH = 0.06;
/** Highest crash point. */
export const MAX_CRASH = 1000;
/** Bet limits and automatic cash-out limits (checked again by the database). */
export const MIN_BET = 10;
export const MAX_BET = 100000;
export const MIN_AUTO = 1.01;
export const MAX_AUTO = 1000;

/** Multiplier after `seconds` of flight, floored to 2 decimals. */
export const multiplierAt = (seconds: number) => Math.max(1, Math.floor(Math.exp(GROWTH * Math.max(0, seconds)) * 100) / 100);

/** Seconds of flight until the multiplier reaches `x`. */
export const secondsTo = (x: number) => Math.log(Math.max(1, x)) / GROWTH;

const E = 2n ** 52n;

/**
 * The crash point of a round from its revealed seed: h = HMAC-SHA256(seed, "crash:<round>"), r = first 52
 * bits; 1.00 when r % 33 = 0, else floor(100·2^52 / (2^52 − r)) / 100, at most 1000.
 */
export function crashPoint(seedHex: string, round: number): number {
  const h = toHex(hmacSha256(fromHex(seedHex), new TextEncoder().encode(`crash:${round}`)));
  const r = BigInt(`0x${h.slice(0, 13)}`);
  if (r % 33n === 0n) return 1;
  return Math.min(Number((100n * E) / (E - r)) / 100, MAX_CRASH);
}

export interface CrashRevealed extends RevealedRound {
  crash: number;
}

/** A finished round checks out: the seed matches the published hash and gives the crash point shown. */
export const verifyCrash = (r: CrashRevealed) => seedHash(r.seed) === r.hash && crashPoint(r.seed, r.round) === r.crash;
