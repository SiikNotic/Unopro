// Match setup for Domino and Bingo: what the setup screen chose, remembered between visits and validated
// on every read (storage can be edited).
import { storage } from '@/storage';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export const DOMINO_SCENES = ['salon', 'cafe', 'terrace', 'lounge', 'woodhouse'] as const;
export const BINGO_SCENES = ['hall', 'theater', 'party', 'casino', 'future'] as const;
export type DominoScene = (typeof DOMINO_SCENES)[number];
export type BingoScene = (typeof BINGO_SCENES)[number];
export type GameScene = DominoScene | BingoScene;

/** Who sits in a seat other than yours: a bot, or another person passing this device. */
export type OtherSeat = 'bot' | 'local';

export interface DominoSetup {
  seats: 2 | 3 | 4;
  others: OtherSeat[];
  difficulty: Difficulty;
  target: 100 | 200;
  scene: DominoScene | 'random';
}

export type BingoSpeed = 'slow' | 'normal' | 'fast';
export const BINGO_SPEEDS: BingoSpeed[] = ['slow', 'normal', 'fast'];

export interface BingoSetup {
  players: 1 | 2 | 3 | 4;
  difficulty: Difficulty;
  speed: BingoSpeed;
  autoMark: boolean;
  scene: BingoScene | 'random';
}

export const DEFAULT_DOMINO: DominoSetup = { seats: 4, others: ['bot', 'bot', 'bot'], difficulty: 'normal', target: 100, scene: 'random' };
export const DEFAULT_BINGO: BingoSetup = { players: 4, difficulty: 'normal', speed: 'normal', autoMark: false, scene: 'random' };

const oneOf = <T,>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

export function normalizeDomino(raw: unknown): DominoSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seats = oneOf([2, 3, 4] as const, r.seats, DEFAULT_DOMINO.seats);
  const others = Array.from({ length: 3 }, (_, i) => oneOf(['bot', 'local'] as const, Array.isArray(r.others) ? r.others[i] : null, 'bot'));
  return {
    seats,
    others,
    difficulty: oneOf(DIFFICULTIES, r.difficulty, DEFAULT_DOMINO.difficulty),
    target: oneOf([100, 200] as const, r.target, DEFAULT_DOMINO.target),
    scene: oneOf([...DOMINO_SCENES, 'random'] as const, r.scene, DEFAULT_DOMINO.scene),
  };
}

export function normalizeBingo(raw: unknown): BingoSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    players: oneOf([1, 2, 3, 4] as const, r.players, DEFAULT_BINGO.players),
    difficulty: oneOf(DIFFICULTIES, r.difficulty, DEFAULT_BINGO.difficulty),
    speed: oneOf(BINGO_SPEEDS, r.speed, DEFAULT_BINGO.speed),
    autoMark: typeof r.autoMark === 'boolean' ? r.autoMark : DEFAULT_BINGO.autoMark,
    scene: oneOf([...BINGO_SCENES, 'random'] as const, r.scene, DEFAULT_BINGO.scene),
  };
}

const KEYS = { domino: 'games.domino.setup', bingo: 'games.bingo.setup' } as const;

export const loadDominoSetup = () => normalizeDomino(storage.get(KEYS.domino));
export const saveDominoSetup = (s: DominoSetup) => storage.set(KEYS.domino, s);
export const loadBingoSetup = () => normalizeBingo(storage.get(KEYS.bingo));
export const saveBingoSetup = (s: BingoSetup) => storage.set(KEYS.bingo, s);

/** A concrete scene for a new match: the fixed choice, or a random one that isn't the last one played. */
export function pickScene<T extends string>(choice: T | 'random', all: readonly T[], lastKey: string): T {
  if (choice !== 'random') return choice;
  const last = storage.get<string>(lastKey);
  const pool = all.filter((s) => s !== last);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const picked = pool[buf[0] % pool.length];
  storage.set(lastKey, picked);
  return picked;
}
