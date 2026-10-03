// The games of Carta Casino: the one list every screen reads (Home, Play, Tutorials, availability). Adding a game
// means adding it here once; each screen then shows it with the same name, picture, category and destination.
// Pure data (no React), so the server-side code and the tests can import it too.
import type { Screen } from '@/types/navigation';
import type { ControlledGame } from '@/games/online/protocol';

export type GameId = 'carta' | 'domino' | 'bingo' | 'jewels' | 'crash' | 'horse' | 'airhockey' | 'billiards' | 'blackjack' | 'roulette' | 'poker' | 'slots';

/** Where a game is listed on the Play screen. */
export type GameSection = 'table' | 'puzzle' | 'casino';
/** Home's filter chips. */
export type GameCategory = 'cards' | 'table' | 'slots' | 'puzzle' | 'instant';
/** Games with an online table of their own on the Play screen. */
export type OnlineTableGame = 'carta' | 'blackjack' | 'roulette';

/** The lessons of the Tutorial screen. */
export type TopicId =
  | 'coins'
  | 'online'
  | 'cards'
  | 'turns'
  | 'specials'
  | 'uno'
  | 'strategy'
  | 'cartaModes'
  | 'domino'
  | 'bingo'
  | 'jewels'
  | 'crash'
  | 'horse'
  | 'airhockey'
  | 'billiards'
  | 'blackjack'
  | 'roulette'
  | 'poker'
  | 'slots'
  | 'premiumSlots';

export interface GameInfo {
  id: GameId;
  /** The screen that starts it (its setup, lobby or table). */
  screen: Screen;
  section: GameSection;
  category: GameCategory;
  /** The owner's on/off switch that applies to it (game_availability), or null if it has none. */
  controlled: ControlledGame | null;
  /** Name and one-line description for lists (translation keys). */
  nameKey: string;
  descKey: string;
  /** Its online table on the Play screen, if it has one. */
  online?: OnlineTableGame;
  /** Its lessons, in order. */
  tutorials: TopicId[];
}

/** Display order of the Play screen: table games, puzzle, then the casino. */
export const GAMES: readonly GameInfo[] = [
  { id: 'carta', screen: 'cartaSetup', section: 'table', category: 'cards', controlled: 'carta', nameKey: 'hub.carta.name', descKey: 'hub.carta.desc', online: 'carta', tutorials: ['cards', 'turns', 'specials', 'uno', 'strategy', 'cartaModes'] },
  { id: 'domino', screen: 'dominoSetup', section: 'table', category: 'table', controlled: 'domino', nameKey: 'hub.domino.name', descKey: 'hub.domino.desc', tutorials: ['domino'] },
  { id: 'bingo', screen: 'bingoSetup', section: 'table', category: 'table', controlled: 'bingo', nameKey: 'hub.bingo.name', descKey: 'hub.bingo.desc', tutorials: ['bingo'] },
  { id: 'billiards', screen: 'billiards', section: 'table', category: 'table', controlled: 'billiards', nameKey: 'billiards.name', descKey: 'billiards.desc', tutorials: ['billiards'] },
  { id: 'jewels', screen: 'jewels', section: 'puzzle', category: 'puzzle', controlled: null, nameKey: 'jewels.entry', descKey: 'jewels.entryHint', tutorials: ['jewels'] },
  { id: 'crash', screen: 'crash', section: 'casino', category: 'instant', controlled: 'crash', nameKey: 'casino.crash.name', descKey: 'casino.crash.description', tutorials: ['crash'] },
  { id: 'horse', screen: 'horse', section: 'casino', category: 'instant', controlled: 'horse', nameKey: 'casino.horse.name', descKey: 'casino.horse.description', tutorials: ['horse'] },
  { id: 'airhockey', screen: 'airhockey', section: 'casino', category: 'table', controlled: 'airhockey', nameKey: 'casino.airhockey.name', descKey: 'casino.airhockey.description', tutorials: ['airhockey'] },
  { id: 'blackjack', screen: 'blackjackSetup', section: 'casino', category: 'cards', controlled: 'blackjack', nameKey: 'casino.blackjack.name', descKey: 'casino.blackjack.description', online: 'blackjack', tutorials: ['blackjack'] },
  { id: 'roulette', screen: 'rouletteSetup', section: 'casino', category: 'table', controlled: 'roulette', nameKey: 'casino.roulette.name', descKey: 'casino.roulette.description', online: 'roulette', tutorials: ['roulette'] },
  { id: 'poker', screen: 'pokerSetup', section: 'casino', category: 'cards', controlled: 'poker', nameKey: 'casino.poker.name', descKey: 'casino.poker.description', tutorials: ['poker'] },
  { id: 'slots', screen: 'slotLobby', section: 'casino', category: 'slots', controlled: 'slots', nameKey: 'casino.slots.name', descKey: 'casino.slots.description', tutorials: ['slots', 'premiumSlots'] },
];

export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);

const BY_ID = new Map(GAMES.map((g) => [g.id, g]));
export function gameInfo(id: GameId): GameInfo {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`unknown game ${id}`);
  return g;
}

export const gamesIn = (section: GameSection) => GAMES.filter((g) => g.section === section);

/** Lessons that belong to no single game. */
export const GENERAL_TOPICS: TopicId[] = ['coins', 'online'];

/** Every lesson with the game it belongs to (null for the general ones), in the order the Tutorial lists them. */
export const TOPIC_ORDER: { id: TopicId; game: GameId | null }[] = [
  ...GENERAL_TOPICS.map((id) => ({ id, game: null })),
  ...GAMES.flatMap((g) => g.tutorials.map((id) => ({ id, game: g.id }))),
];
