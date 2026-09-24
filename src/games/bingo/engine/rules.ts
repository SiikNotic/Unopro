// Bingo rules that need no hidden information: card generation, lines, legality of a daub.
import { createRng, shuffle } from '@/games/shared/rng';
import type { Rng } from '@/games/shared/rng';
import { BALLS, CELLS, CENTER, LETTERS } from './types';

export const PLAYERS_MIN = 1;
export const PLAYERS_MAX = 4;
/** Points shared by the round's winners (split evenly, rounded down). */
export const ROUND_POINTS = 100;
/** A false BINGO blocks new claims until this many more numbers have been called. */
export const FALSE_CLAIM_PENALTY = 3;

/** Column of a ball: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75. */
export const columnOf = (n: number) => Math.floor((n - 1) / 15);
export const letterOf = (n: number) => LETTERS[columnOf(n)];

/** Five different numbers per column from that column's range; the N column's middle cell is FREE. */
export function generateCard(rng: Rng): number[] {
  const card = new Array<number>(CELLS).fill(0);
  for (let col = 0; col < 5; col++) {
    const pool = Array.from({ length: 15 }, (_, i) => col * 15 + i + 1);
    const picked = shuffle(pool, rng).slice(0, 5);
    for (let row = 0; row < 5; row++) card[row * 5 + col] = picked[row];
  }
  card[CENTER] = 0;
  return card;
}

export function newDrawOrder(rng: Rng): number[] {
  return shuffle(Array.from({ length: BALLS }, (_, i) => i + 1), rng);
}

/** The 12 winning lines: 5 rows, 5 columns, 2 diagonals (FREE counts as daubed). */
export const LINES: number[][] = [
  ...Array.from({ length: 5 }, (_, r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...Array.from({ length: 5 }, (_, c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export const freshMarks = () => Array.from({ length: CELLS }, (_, i) => i === CENTER);

export function completedLines(marks: readonly boolean[]): number[][] {
  return LINES.filter((line) => line.every((i) => marks[i]));
}
export const hasBingo = (marks: readonly boolean[]) => completedLines(marks).length > 0;

/** Lines one daub away from BINGO (for the "almost" cue on your own card). */
export function nearLines(marks: readonly boolean[]): number[][] {
  return LINES.filter((line) => line.filter((i) => marks[i]).length === 4);
}

/** Numbers on this card that have been called but not daubed yet. */
export function markable(card: readonly number[], marks: readonly boolean[], called: readonly number[]): number[] {
  const set = new Set(called);
  return card.filter((n, i) => n !== 0 && !marks[i] && set.has(n));
}

export { createRng };
