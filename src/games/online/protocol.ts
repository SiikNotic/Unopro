// What travels between the browser and the game-room server. Shared by both sides.
import type { DominoAction, DominoEvent, DominoView } from '@/games/domino/engine';
import type { BingoAction, BingoEvent, BingoView } from '@/games/bingo/engine';
import type { BingoSpeed, Difficulty } from '@/games/shared/setup';
import type { CartaView } from './server/carta';
import type { BjView } from '@/casino/table/blackjackTable';
import type { RtView } from '@/casino/table/rouletteTable';

export type RoomGame = 'domino' | 'bingo' | 'carta' | 'blackjack' | 'roulette';
/** Games played for account coins (registered, non-banned accounts only). */
export const COIN_GAMES: readonly RoomGame[] = ['blackjack', 'roulette'];
/** Games with quick match ("Jugar ahora"). */
export const QUICK_GAMES: readonly RoomGame[] = ['carta', 'blackjack', 'roulette'];
/** Seats allowed per game (min, max) and the default for quick match. */
export const SEAT_RANGE: Record<RoomGame, { min: number; max: number; quick: number }> = {
  domino: { min: 2, max: 4, quick: 4 },
  bingo: { min: 1, max: 4, quick: 4 },
  carta: { min: 2, max: 6, quick: 4 },
  blackjack: { min: 1, max: 5, quick: 5 },
  roulette: { min: 1, max: 6, quick: 6 },
};
export type RoomStatus = 'lobby' | 'playing' | 'closed';

export interface RoomSettings {
  difficulty: Difficulty;
  /** Domino only. */
  target?: 100 | 200;
  /** Bingo only. */
  speed?: BingoSpeed;
  /** Found by quick match. */
  public?: boolean;
}

export interface RoomMemberView {
  seat: string;
  name: string;
  ready: boolean;
  host: boolean;
}

/** One player's picture of the room: public room data + their own game view + what just happened. */
export interface RoomView {
  roomId: string;
  code: string;
  game: RoomGame;
  seats: number;
  status: RoomStatus;
  settings: RoomSettings;
  you: string;
  members: RoomMemberView[];
  version: number;
  /** Server clock when this view was made (ms). */
  serverNow: number;
  /** Domino / Carta: when an idle human's turn is played for them (ms, server clock). */
  turnDeadline: number | null;
  /** Public Carta lobby: when the match starts by itself (ms, server clock). */
  startsAt: number | null;
  domino: DominoView | null;
  bingo: BingoView | null;
  carta: CartaView | null;
  blackjack: BjView | null;
  roulette: RtView | null;
  /** Coin tables: your account balance after the server's last coin operation for you, if any. */
  balance: number | null;
  /** Events of the change that produced this view (sanitised for this player). */
  events: (DominoEvent | BingoEvent)[];
}

export type RoomRequest =
  | { op: 'create'; game: RoomGame; seats: number; name: string; settings: RoomSettings }
  | { op: 'join'; code: string; name: string }
  | { op: 'ready'; code: string; ready: boolean }
  | { op: 'start'; code: string }
  | { op: 'quick'; game: RoomGame; name: string }
  | { op: 'act'; code: string; action: DominoAction | BingoAction | Record<string, unknown> }
  | { op: 'tick'; code: string }
  | { op: 'sync'; code: string }
  | { op: 'leave'; code: string }
  | { op: 'rematch'; code: string };

export type RoomErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'bad_request'
  | 'not_found'
  | 'not_member'
  | 'full'
  | 'started'
  | 'not_host'
  | 'not_ready'
  | 'not_playing'
  | 'forbidden'
  | 'busy'
  | 'rule'
  | 'insufficient_funds'
  | 'not_registered'
  | 'banned';

export type RoomResponse = { ok: true; view: RoomView } | { ok: false; code: RoomErrorCode; detail?: string };
