// Levels are data: add one by appending an entry. Each level defines its board, how many jewel kinds fall,
// the moves, the goals (all must be met), optional ice and the star scores.
import type { Goal } from './types';

export interface LevelDef {
  id: number;
  rows: number;
  cols: number;
  /** Kinds in play (3–6): fewer kinds → more matches → easier. */
  kinds: number;
  moves: number;
  goals: Goal[];
  /** Rows of '.' / '#': '#' puts ice under that cell. */
  ice?: string[];
  /** Score for 1, 2 and 3 stars. */
  stars: [number, number, number];
}

const collect = (kind: number, count: number): Goal => ({ type: 'collect', kind, count });
const score = (target: number): Goal => ({ type: 'score', target });
const ICE: Goal = { type: 'ice' };

// Kinds: 0 diamond, 1 emerald, 2 ruby, 3 sapphire, 4 amethyst, 5 topaz.
export const LEVELS: LevelDef[] = [
  { id: 1, rows: 8, cols: 7, kinds: 5, moves: 25, goals: [collect(0, 20)], stars: [1500, 3000, 4500] },
  { id: 2, rows: 8, cols: 7, kinds: 5, moves: 22, goals: [collect(2, 30)], stars: [2000, 3800, 5500] },
  { id: 3, rows: 8, cols: 8, kinds: 5, moves: 20, goals: [score(4000)], stars: [4000, 6000, 8000] },
  { id: 4, rows: 8, cols: 8, kinds: 5, moves: 22, goals: [collect(1, 20), collect(3, 20)], stars: [2500, 4500, 6500] },
  {
    id: 5,
    rows: 8,
    cols: 8,
    kinds: 5,
    moves: 24,
    goals: [ICE],
    ice: ['........', '........', '..####..', '.######.', '.######.', '..####..', '........', '........'],
    stars: [2500, 4500, 6500],
  },
  { id: 6, rows: 9, cols: 8, kinds: 6, moves: 25, goals: [collect(4, 25), collect(5, 25)], stars: [3000, 5500, 8000] },
  { id: 7, rows: 9, cols: 8, kinds: 6, moves: 22, goals: [score(7000)], stars: [7000, 9500, 12000] },
  {
    id: 8,
    rows: 9,
    cols: 8,
    kinds: 6,
    moves: 26,
    goals: [ICE, collect(0, 20)],
    ice: ['........', '........', '#......#', '##....##', '###..###', '##....##', '#......#', '........', '........'],
    stars: [3500, 6000, 9000],
  },
  { id: 9, rows: 9, cols: 9, kinds: 6, moves: 24, goals: [collect(2, 30), collect(3, 30)], stars: [4000, 7000, 10000] },
  {
    id: 10,
    rows: 9,
    cols: 9,
    kinds: 6,
    moves: 28,
    goals: [ICE, score(8000)],
    ice: ['.........', '.#######.', '.#.....#.', '.#.###.#.', '.#.###.#.', '.#.###.#.', '.#.....#.', '.#######.', '.........'],
    stars: [8000, 11000, 14000],
  },
  { id: 11, rows: 9, cols: 9, kinds: 6, moves: 22, goals: [collect(1, 35), collect(4, 35)], stars: [5000, 8000, 11000] },
  { id: 12, rows: 9, cols: 9, kinds: 6, moves: 25, goals: [collect(0, 30), collect(2, 30), collect(5, 30)], stars: [6000, 9500, 13000] },
];

export const levelById = (id: number) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
