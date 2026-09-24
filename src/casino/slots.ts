// "Gold Rush" video slot: 5 reels × 3 rows, up to 10 paylines, sheriff star as wild.
// Pure; results come from a seeded PRNG. Wins pay left to right on active lines.
import type { Rng } from '@/game/engine';

export type SlotSymbol =
  | 'seven'
  | 'gold'
  | 'eagle'
  | 'bison'
  | 'wagon'
  | 'revolver'
  | 'moneybag'
  | 'hat'
  | 'horseshoe'
  | 'cactus'
  | 'star';

export const WILD: SlotSymbol = 'star';
export const REELS = 5;
export const ROWS = 3;

/** One reel strip (39 stops), shared by every reel. Common symbols are spread out so the strip looks varied. */
export const REEL: SlotSymbol[] = [
  'cactus', 'hat', 'bison', 'horseshoe', 'revolver', 'seven', 'cactus', 'moneybag', 'star', 'horseshoe',
  'wagon', 'hat', 'cactus', 'eagle', 'revolver', 'horseshoe', 'moneybag', 'gold', 'hat', 'cactus',
  'bison', 'star', 'horseshoe', 'wagon', 'revolver', 'hat', 'cactus', 'moneybag', 'eagle', 'horseshoe',
  'bison', 'star', 'cactus', 'hat', 'wagon', 'revolver', 'horseshoe', 'gold', 'moneybag',
];

/** Multiplier of the bet per line for 3, 4 and 5 of a kind. */
export const PAYTABLE: Record<SlotSymbol, [number, number, number]> = {
  seven: [50, 250, 2500],
  gold: [30, 120, 750],
  eagle: [25, 100, 500],
  bison: [20, 60, 250],
  wagon: [20, 60, 250],
  revolver: [10, 40, 150],
  moneybag: [10, 40, 150],
  hat: [8, 20, 80],
  horseshoe: [4, 12, 50],
  cactus: [4, 12, 50],
  star: [40, 200, 1000],
};

/** Paylines as the row (0 top – 2 bottom) used on each reel. */
export const LINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 2, 1, 0, 1],
];
export const LINE_OPTIONS = [1, 5, 10] as const;
export const BET_PER_LINE = [1, 2, 5, 10, 20] as const;

export interface LineResult {
  symbol: SlotSymbol;
  count: number;
  multiplier: number;
}

export interface LineWin extends LineResult {
  /** Index into LINES. */
  line: number;
  amount: number;
}

export interface SpinOutcome {
  wins: LineWin[];
  total: number;
  /** Five sevens on a line. */
  jackpot: boolean;
}

/** Left-to-right result for the five symbols of one line (wilds substitute; a wild run can also pay as itself). */
export function evaluateLine(line: SlotSymbol[]): LineResult | null {
  const base = line.find((s) => s !== WILD) ?? WILD;
  let count = 0;
  while (count < line.length && (line[count] === base || line[count] === WILD)) count++;
  let wilds = 0;
  while (wilds < line.length && line[wilds] === WILD) wilds++;

  const basePay = count >= 3 ? PAYTABLE[base][count - 3] : 0;
  const wildPay = wilds >= 3 ? PAYTABLE[WILD][wilds - 3] : 0;
  if (basePay === 0 && wildPay === 0) return null;
  return wildPay > basePay ? { symbol: WILD, count: wilds, multiplier: wildPay } : { symbol: base, count, multiplier: basePay };
}

export function spinReels(rng: Rng): number[] {
  return Array.from({ length: REELS }, () => Math.floor(rng.next() * REEL.length));
}

export const symbolAt = (stop: number, offset = 0): SlotSymbol => REEL[(((stop + offset) % REEL.length) + REEL.length) % REEL.length];

/** Visible symbols: grid[reel][row], rows are stop-1, stop, stop+1. */
export function visibleGrid(stops: number[]): SlotSymbol[][] {
  return stops.map((stop) => [symbolAt(stop, -1), symbolAt(stop), symbolAt(stop, 1)]);
}

export function lineSymbols(grid: SlotSymbol[][], line: number): SlotSymbol[] {
  return LINES[line].map((row, reel) => grid[reel][row]);
}

export function evaluateSpin(stops: number[], lineCount: number, betPerLine: number): SpinOutcome {
  const grid = visibleGrid(stops);
  const wins: LineWin[] = [];
  for (let line = 0; line < Math.min(lineCount, LINES.length); line++) {
    const result = evaluateLine(lineSymbols(grid, line));
    if (result) wins.push({ ...result, line, amount: result.multiplier * betPerLine });
  }
  return {
    wins,
    total: wins.reduce((sum, w) => sum + w.amount, 0),
    jackpot: wins.some((w) => w.symbol === 'seven' && w.count === 5),
  };
}

/** Cells (reel, row) that make up a line win, for highlighting. */
export function winCells(win: LineWin): [number, number][] {
  return LINES[win.line].slice(0, win.count).map((row, reel) => [reel, row]);
}

/**
 * Exact return per line over every combination of the five line symbols. Every line has the same
 * distribution (each cell is uniform over the strip), so this is also the return for any number of lines.
 */
export function returnToPlayer(): number {
  const counts = new Map<SlotSymbol, number>();
  for (const s of REEL) counts.set(s, (counts.get(s) ?? 0) + 1);
  const symbols = [...counts.keys()];
  const n = REEL.length;
  let total = 0;
  const line: SlotSymbol[] = [];
  const walk = (depth: number, weight: number) => {
    if (depth === REELS) {
      const r = evaluateLine(line);
      if (r) total += weight * r.multiplier;
      return;
    }
    for (const s of symbols) {
      line[depth] = s;
      walk(depth + 1, weight * counts.get(s)!);
    }
  };
  walk(0, 1);
  return total / n ** REELS;
}
