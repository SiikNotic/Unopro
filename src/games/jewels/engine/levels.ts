// Levels are data: add one by appending an entry (see docs/jewellery.md). Each level defines its board,
// how many jewel kinds fall, the moves, the goals (all must be met), optional crystal and marble seals,
// which specials can be made, the star scores and the reward. Star scores are calibrated by simulation
// (src/games/jewels/__tests__/simulation.test.ts prints the numbers).
import type { Booster, Goal, Special } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'divine';

export interface LevelDef {
  id: number;
  rows: number;
  cols: number;
  /** Kinds in play (3–6): fewer kinds → more matches → easier. */
  kinds: number;
  moves: number;
  goals: Goal[];
  /** Rows of '.' / '#': '#' puts crystal under that cell. */
  ice?: string[];
  /** Rows of '.' / '1' / '2': a marble seal with that many hits. */
  stones?: string[];
  /** Specials this level can make (default: all). */
  specials?: Special[];
  /** Score for 1, 2 and 3 stars. */
  stars: [number, number, number];
  difficulty: Difficulty;
  /** Power-up charge earned the first time the level is won. */
  reward: Booster;
}

const collect = (kind: number, count: number): Goal => ({ type: 'collect', kind, count });
const score = (target: number): Goal => ({ type: 'score', target });
const matches = (count: number): Goal => ({ type: 'matches', count });
const combos = (count: number): Goal => ({ type: 'combos', count });
const specials = (count: number): Goal => ({ type: 'specials', count });
const ICE: Goal = { type: 'ice' };
const STONE: Goal = { type: 'stone' };
const LINES_ONLY: Special[] = ['lineH', 'lineV'];
const NO_TRIDENT: Special[] = ['lineH', 'lineV', 'bomb'];

// Kinds: 0 Celestial Diamond, 1 Divine Emerald, 2 Ruby of Fire, 3 Sapphire of Poseidon, 4 Amethyst of Hades,
// 5 Golden Topaz.
export const LEVELS: LevelDef[] = [
  // --- The Steps of Olympus: learn the basics.
  { id: 1, rows: 7, cols: 7, kinds: 4, moves: 16, goals: [score(3500)], specials: LINES_ONLY, stars: [5000, 7000, 12500], difficulty: 'easy', reward: 'hammer' },
  { id: 2, rows: 7, cols: 7, kinds: 5, moves: 20, goals: [collect(2, 18)], specials: LINES_ONLY, stars: [5500, 9000, 13000], difficulty: 'easy', reward: 'shuffle' },
  { id: 3, rows: 7, cols: 7, kinds: 5, moves: 16, goals: [matches(14)], specials: NO_TRIDENT, stars: [4000, 6000, 8500], difficulty: 'easy', reward: 'lightning' },
  {
    id: 4,
    rows: 7,
    cols: 7,
    kinds: 5,
    moves: 18,
    goals: [STONE],
    stones: ['.......', '.......', '.......', '..111..', '.1...1.', '.......', '.......'],
    specials: NO_TRIDENT,
    stars: [3500, 5000, 8000],
    difficulty: 'easy',
    reward: 'hammer',
  },
  { id: 5, rows: 7, cols: 7, kinds: 5, moves: 22, goals: [specials(3)], stars: [6500, 10000, 14500], difficulty: 'normal', reward: 'olympus' },
  // --- The Crystal Gardens.
  {
    id: 6,
    rows: 8,
    cols: 7,
    kinds: 5,
    moves: 20,
    goals: [ICE],
    ice: ['.......', '.......', '..###..', '.#####.', '.#####.', '..###..', '.......', '.......'],
    stars: [6000, 10000, 16000],
    difficulty: 'normal',
    reward: 'shuffle',
  },
  { id: 7, rows: 7, cols: 7, kinds: 5, moves: 18, goals: [combos(6)], stars: [4500, 5500, 8000], difficulty: 'normal', reward: 'lightning' },
  { id: 8, rows: 7, cols: 7, kinds: 5, moves: 20, goals: [collect(3, 20), collect(4, 20)], stars: [7000, 10000, 13500], difficulty: 'normal', reward: 'hammer' },
  {
    id: 9,
    rows: 7,
    cols: 7,
    kinds: 5,
    moves: 22,
    goals: [STONE, score(6000)],
    stones: ['.......', '.......', '.......', '2.2.2.2', '.......', '.......', '.......'],
    stars: [6500, 9000, 13000],
    difficulty: 'normal',
    reward: 'olympus',
  },
  {
    id: 10,
    rows: 8,
    cols: 7,
    kinds: 5,
    moves: 22,
    goals: [ICE, STONE],
    ice: ['.......', '.......', '#.....#', '##...##', '##...##', '#.....#', '.......', '.......'],
    stones: ['.......', '.......', '.......', '...1...', '...1...', '.......', '.......', '.......'],
    stars: [7500, 13000, 18000],
    difficulty: 'hard',
    reward: 'lightning',
  },
  // --- The Halls of the Gods.
  { id: 11, rows: 8, cols: 8, kinds: 6, moves: 22, goals: [score(7000)], stars: [7000, 8500, 10500], difficulty: 'normal', reward: 'shuffle' },
  { id: 12, rows: 7, cols: 7, kinds: 6, moves: 24, goals: [collect(0, 18), collect(2, 18), collect(5, 18)], stars: [6000, 9000, 11000], difficulty: 'hard', reward: 'hammer' },
  { id: 13, rows: 7, cols: 7, kinds: 5, moves: 22, goals: [specials(6), matches(20)], stars: [10500, 15500, 19500], difficulty: 'hard', reward: 'olympus' },
  {
    id: 14,
    rows: 8,
    cols: 7,
    kinds: 5,
    moves: 22,
    goals: [STONE],
    stones: ['.......', '.......', '.......', '.2...2.', '..2.2..', '...2...', '.......', '.......'],
    stars: [5000, 8000, 11500],
    difficulty: 'hard',
    reward: 'lightning',
  },
  {
    id: 15,
    rows: 8,
    cols: 8,
    kinds: 6,
    moves: 28,
    goals: [ICE, collect(1, 20)],
    ice: ['........', '.######.', '.#....#.', '.#....#.', '.#....#.', '.#....#.', '.######.', '........'],
    stars: [8000, 11500, 14000],
    difficulty: 'hard',
    reward: 'shuffle',
  },
  // --- The Throne of Olympus.
  { id: 16, rows: 7, cols: 7, kinds: 5, moves: 20, goals: [combos(9), score(8000)], stars: [8000, 10500, 13000], difficulty: 'hard', reward: 'hammer' },
  {
    id: 17,
    rows: 8,
    cols: 8,
    kinds: 5,
    moves: 24,
    goals: [ICE, STONE],
    ice: ['........', '.##..##.', '.##..##.', '........', '........', '.##..##.', '.##..##.', '........'],
    stones: ['........', '........', '........', '...11...', '...11...', '........', '........', '........'],
    stars: [9000, 14000, 22000],
    difficulty: 'divine',
    reward: 'olympus',
  },
  { id: 18, rows: 7, cols: 7, kinds: 5, moves: 22, goals: [specials(6)], stars: [10000, 15500, 19000], difficulty: 'divine', reward: 'lightning' },
  { id: 19, rows: 8, cols: 8, kinds: 6, moves: 28, goals: [collect(3, 25), collect(4, 25), collect(1, 25)], stars: [8000, 12500, 16000], difficulty: 'divine', reward: 'shuffle' },
  {
    id: 20,
    rows: 8,
    cols: 8,
    kinds: 6,
    moves: 32,
    goals: [ICE, STONE, score(12000)],
    ice: ['........', '........', '..####..', '..#..#..', '..#..#..', '..####..', '........', '........'],
    stones: ['........', '........', '........', '...22...', '...22...', '........', '........', '........'],
    stars: [12000, 13500, 15500],
    difficulty: 'divine',
    reward: 'olympus',
  },
];

export const levelById = (id: number) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
