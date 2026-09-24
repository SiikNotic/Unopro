// What travels between the browser and the game-room server. Shared by both sides.
import type { DominoAction, DominoEvent, DominoView } from '@/games/domino/engine';
import type { BingoAction, BingoEvent, BingoView } from '@/games/bingo/engine';
import type { BingoSpeed, Difficulty } from '@/games/shared/setup';

export type RoomGame = 'domino' | 'bingo';
export type RoomStatus = 'lobby' | 'playing' | 'closed';

export interface RoomSettings {
  difficulty: Difficulty;
  /** Domino only. */
  target?: 100 | 200;
  /** Bingo only. */
  speed?: BingoSpeed;
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
  /** Domino: when an idle human's turn is played for them (ms, server clock). */
  turnDeadline: number | null;
  domino: DominoView | null;
  bingo: BingoView | null;
  /** Events of the change that produced this view (sanitised for this player). */
  events: (DominoEvent | BingoEvent)[];
}

export type RoomRequest =
  | { op: 'create'; game: RoomGame; seats: number; name: string; settings: RoomSettings }
  | { op: 'join'; code: string; name: string }
  | { op: 'ready'; code: string; ready: boolean }
  | { op: 'start'; code: string }
  | { op: 'act'; code: string; action: DominoAction | BingoAction }
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
  | 'rule';

export type RoomResponse = { ok: true; view: RoomView } | { ok: false; code: RoomErrorCode; detail?: string };
