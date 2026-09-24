// European roulette (single zero). Pure functions; the wheel result comes from a seeded PRNG.
import type { Rng } from '@/game/engine';

export const POCKETS = 37;
/** Numbers in wheel order, starting at 0 (used to draw the wheel). */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type BetType = 'straight' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'dozen' | 'column';

export interface Bet {
  type: BetType;
  /** Number for straight bets (0–36), 1–3 for dozen/column. */
  value?: number;
  amount: number;
}

export const PAYOUT: Record<BetType, number> = {
  straight: 35,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
  dozen: 2,
  column: 2,
};

export function pocketColor(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function betWins(bet: Bet, n: number): boolean {
  if (bet.type === 'straight') return bet.value === n;
  if (n === 0) return false;
  switch (bet.type) {
    case 'red':
      return RED_NUMBERS.has(n);
    case 'black':
      return !RED_NUMBERS.has(n);
    case 'even':
      return n % 2 === 0;
    case 'odd':
      return n % 2 === 1;
    case 'low':
      return n <= 18;
    case 'high':
      return n >= 19;
    case 'dozen':
      return Math.ceil(n / 12) === bet.value;
    case 'column':
      return ((n - 1) % 3) + 1 === bet.value;
  }
}

/** Chips credited for one bet (stake included), 0 if it loses. */
export function betPayout(bet: Bet, n: number): number {
  return betWins(bet, n) ? bet.amount * (PAYOUT[bet.type] + 1) : 0;
}

export function totalPayout(bets: Bet[], n: number): number {
  return bets.reduce((sum, b) => sum + betPayout(b, n), 0);
}

export function spin(rng: Rng): number {
  return Math.floor(rng.next() * POCKETS);
}

/** Same bet spot? (used to stack chips on a spot) */
export const sameSpot = (a: Bet, b: Bet) => a.type === b.type && a.value === b.value;
