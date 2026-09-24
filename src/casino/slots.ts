// Three-reel "Gold Rush" slot with original Old West symbols and one payline.
// Pure; results come from a seeded PRNG.
import type { Rng } from '@/game/engine';

export type SlotSymbol = 'seven' | 'gold' | 'eagle' | 'bison' | 'wagon' | 'horse' | 'horseshoe';

/** Each reel strip (20 stops). Rarer symbols pay more. */
export const REEL: SlotSymbol[] = [
  'seven',
  'gold', 'gold',
  'eagle', 'eagle', 'eagle',
  'bison', 'bison', 'bison',
  'wagon', 'wagon', 'wagon',
  'horse', 'horse', 'horse', 'horse',
  'horseshoe', 'horseshoe', 'horseshoe', 'horseshoe',
];

export const THREE_OF_A_KIND: Record<SlotSymbol, number> = { seven: 200, gold: 60, eagle: 30, bison: 15, wagon: 15, horse: 10, horseshoe: 10 };
export const TWO_GOLD = 5;
export const ONE_GOLD = 1;
/** Three different frontier symbols (bison, wagon, horse, horseshoe) on the line. */
export const MIXED_FRONTIER = 1;
export const FRONTIER_SYMBOLS = new Set<SlotSymbol>(['bison', 'wagon', 'horse', 'horseshoe']);

export type WinKind = 'three' | 'twoGold' | 'mixedFrontier' | 'oneGold' | 'none';

/** Multiplier of the bet for a payline (the stake is included: ×1 gives the bet back). */
export function lineWin(line: SlotSymbol[]): { multiplier: number; kind: WinKind } {
  const [a, b, c] = line;
  if (a === b && b === c) return { multiplier: THREE_OF_A_KIND[a], kind: 'three' };
  const golds = line.filter((s) => s === 'gold').length;
  if (golds === 2) return { multiplier: TWO_GOLD, kind: 'twoGold' };
  if (line.every((s) => FRONTIER_SYMBOLS.has(s)) && new Set(line).size === 3) return { multiplier: MIXED_FRONTIER, kind: 'mixedFrontier' };
  if (golds === 1) return { multiplier: ONE_GOLD, kind: 'oneGold' };
  return { multiplier: 0, kind: 'none' };
}

/** Which reels (0–2) make up the win, for highlighting. */
export function winningReels(line: SlotSymbol[]): number[] {
  const { kind } = lineWin(line);
  if (kind === 'three' || kind === 'mixedFrontier') return [0, 1, 2];
  if (kind === 'twoGold' || kind === 'oneGold') return [0, 1, 2].filter((i) => line[i] === 'gold');
  return [];
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
