// Three-reel slot with original symbols and one payline. Pure; results come from a seeded PRNG.
import type { Rng } from '@/game/engine';

export type SlotSymbol = 'seven' | 'gem' | 'star' | 'flame' | 'drop' | 'leaf' | 'sun';

/** Each reel strip (20 stops). Rarer symbols pay more. */
export const REEL: SlotSymbol[] = [
  'seven',
  'gem', 'gem',
  'star', 'star', 'star',
  'flame', 'flame', 'flame',
  'drop', 'drop', 'drop',
  'leaf', 'leaf', 'leaf', 'leaf',
  'sun', 'sun', 'sun', 'sun',
];

export const THREE_OF_A_KIND: Record<SlotSymbol, number> = { seven: 200, gem: 60, star: 30, flame: 15, drop: 15, leaf: 10, sun: 10 };
export const TWO_GEMS = 5;
export const ONE_GEM = 1;
/** Three different suits (flame, drop, leaf, sun) on the line. */
export const MIXED_SUITS = 1;
const SUIT_SYMBOLS = new Set<SlotSymbol>(['flame', 'drop', 'leaf', 'sun']);

export type WinKind = 'three' | 'twoGems' | 'mixedSuits' | 'oneGem' | 'none';

/** Multiplier of the bet for a payline. */
export function lineWin(line: SlotSymbol[]): { multiplier: number; kind: WinKind } {
  const [a, b, c] = line;
  if (a === b && b === c) return { multiplier: THREE_OF_A_KIND[a], kind: 'three' };
  const gems = line.filter((s) => s === 'gem').length;
  if (gems === 2) return { multiplier: TWO_GEMS, kind: 'twoGems' };
  if (line.every((s) => SUIT_SYMBOLS.has(s)) && new Set(line).size === 3) return { multiplier: MIXED_SUITS, kind: 'mixedSuits' };
  if (gems === 1) return { multiplier: ONE_GEM, kind: 'oneGem' };
  return { multiplier: 0, kind: 'none' };
}

/** Stop index for each reel; the visible column is stop-1, stop, stop+1 (payline in the middle). */
export function spinReels(rng: Rng): number[] {
  return [0, 1, 2].map(() => Math.floor(rng.next() * REEL.length));
}

export const symbolAt = (stop: number, offset = 0): SlotSymbol => REEL[(((stop + offset) % REEL.length) + REEL.length) % REEL.length];

export function payline(stops: number[]): SlotSymbol[] {
  return stops.map((s) => symbolAt(s));
}

/** Exact return-to-player over every reel combination (for tests and the paytable screen). */
export function returnToPlayer(): number {
  let total = 0;
  for (const a of REEL) for (const b of REEL) for (const c of REEL) total += lineWin([a, b, c]).multiplier;
  return total / REEL.length ** 3;
}
