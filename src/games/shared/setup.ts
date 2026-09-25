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

// ---------------------------------------------------------------- Carta (against bots, on this device)

/** Carta against bots: the table format, how many sit down and the house rules the engine already supports. */
export type CartaFormat = 'classic' | 'teams';
export interface CartaSetup {
  format: CartaFormat;
  players: 2 | 3 | 4 | 5 | 6;
  target: 250 | 500;
  /** Answer a +2 / +4 with another one and pass the sum on (engine: settings.stacking). */
  stacking: boolean;
  /** Keep drawing until a playable card comes (engine: settings.drawUntilPlayable). */
  drawUntilPlayable: boolean;
}

/** Seats each format supports (teams sit alternately, so partners face each other). */
export const CARTA_PLAYERS: Record<CartaFormat, CartaSetup['players'][]> = { classic: [2, 3, 4, 5, 6], teams: [4, 6] };

/** Team of each seat in team play: they alternate, so partners sit across the table. */
export const cartaTeamOf = (seat: number): 'A' | 'B' => (seat % 2 === 0 ? 'A' : 'B');

export const DEFAULT_CARTA: CartaSetup = { format: 'classic', players: 4, target: 500, stacking: false, drawUntilPlayable: false };

export function normalizeCarta(raw: unknown): CartaSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const format = oneOf(['classic', 'teams'] as const, r.format, DEFAULT_CARTA.format);
  const players = oneOf(CARTA_PLAYERS[format], r.players, format === 'teams' ? 4 : DEFAULT_CARTA.players);
  return {
    format,
    players,
    target: oneOf([250, 500] as const, r.target, DEFAULT_CARTA.target),
    stacking: typeof r.stacking === 'boolean' ? r.stacking : DEFAULT_CARTA.stacking,
    drawUntilPlayable: typeof r.drawUntilPlayable === 'boolean' ? r.drawUntilPlayable : DEFAULT_CARTA.drawUntilPlayable,
  };
}

const CARTA_KEY = 'games.carta.setup';
export const loadCartaSetup = () => normalizeCarta(storage.get(CARTA_KEY));
export const saveCartaSetup = (s: CartaSetup) => storage.set(CARTA_KEY, s);

// ---------------------------------------------------------------- Casino games (Blackjack, Roulette)

/** Scenes of the casino games: the same animated scenarios as Carta. */
export const CASINO_SCENES = ['lounge', 'city', 'sky', 'ocean', 'forest', 'space', 'volcano'] as const;
export type CasinoScene = (typeof CASINO_SCENES)[number];
export type CasinoGame = 'blackjack' | 'roulette';
export interface CasinoSetup {
  scene: CasinoScene | 'random';
}
/** Each game keeps the look it always had unless the player picks another scene. */
export const DEFAULT_CASINO: Record<CasinoGame, CasinoSetup> = { blackjack: { scene: 'lounge' }, roulette: { scene: 'city' } };

export const normalizeCasino = (game: CasinoGame, raw: unknown): CasinoSetup => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { scene: oneOf([...CASINO_SCENES, 'random'] as const, r.scene, DEFAULT_CASINO[game].scene) };
};
export const loadCasinoSetup = (game: CasinoGame) => normalizeCasino(game, storage.get(`games.${game}.setup`));
export const saveCasinoSetup = (game: CasinoGame, s: CasinoSetup) => storage.set(`games.${game}.setup`, s);
/** The scene a casino screen opens with (a random choice avoids repeating the last one). */
export const casinoScene = (game: CasinoGame): CasinoScene => pickScene(loadCasinoSetup(game).scene, CASINO_SCENES, `games.${game}.lastScene`);

// ---------------------------------------------------------------- Poker (against bots, practice chips)

/** Poker against bots: seats at the table, practice-chip stack, blinds, bots' difficulty, scene. */
export interface PokerSetup {
  players: 2 | 3 | 4 | 5 | 6;
  stack: 1000 | 2500 | 5000;
  blinds: '10/20' | '25/50' | '50/100';
  difficulty: Difficulty;
  scene: CasinoScene | 'random';
}
export const POKER_PLAYERS: PokerSetup['players'][] = [2, 3, 4, 5, 6];
export const POKER_STACKS: PokerSetup['stack'][] = [1000, 2500, 5000];
export const POKER_BLINDS: PokerSetup['blinds'][] = ['10/20', '25/50', '50/100'];
export const DEFAULT_POKER: PokerSetup = { players: 6, stack: 1000, blinds: '10/20', difficulty: 'normal', scene: 'lounge' };

export function normalizePoker(raw: unknown): PokerSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    players: oneOf(POKER_PLAYERS, r.players, DEFAULT_POKER.players),
    stack: oneOf(POKER_STACKS, r.stack, DEFAULT_POKER.stack),
    blinds: oneOf(POKER_BLINDS, r.blinds, DEFAULT_POKER.blinds),
    difficulty: oneOf(DIFFICULTIES, r.difficulty, DEFAULT_POKER.difficulty),
    scene: oneOf([...CASINO_SCENES, 'random'] as const, r.scene, DEFAULT_POKER.scene),
  };
}
const POKER_KEY = 'games.poker.setup';
export const loadPokerSetup = () => normalizePoker(storage.get(POKER_KEY));
export const savePokerSetup = (s: PokerSetup) => storage.set(POKER_KEY, s);
export const blindsOf = (b: PokerSetup['blinds']) => b.split('/').map(Number) as [number, number];
