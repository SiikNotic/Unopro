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
/** Games whose rooms may be played for account coins (a stake per player, the pot to the winner). */
export const STAKE_GAMES: readonly RoomGame[] = ['domino', 'bingo', 'carta'];
/** The stakes a room may be created with (0 = no coins). The server accepts nothing else. */
export const STAKES = [0, 100, 500, 1000, 5000] as const;
export type Stake = (typeof STAKES)[number];
/** Games the owner can take out of service (see the game_control_stakes migration). */
export type ControlledGame = 'slots' | 'domino' | 'carta' | 'bingo' | 'blackjack' | 'roulette' | 'poker' | 'crash';
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
  /** Domino / Bingo / Carta: coins each player puts in the pot when a match starts (absent = no coins). */
  stake?: Stake;
}

/**
 * The pot of a staked room. Stakes are taken by the server when the match starts; when it ends the pot is
 * split between the winning players still at the table (a seat won by a bot, or by a player who left,
 * pays nobody). Seats are ids like "s0".
 */
export interface PotView {
  stake: number;
  /** Players who put in a stake this match (0 before the first match). */
  players: number;
  total: number;
  settled: boolean;
  winners: string[];
  /** Paid to each winner. */
  prize: number;
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
  /** Staked rooms: the pot (null when the room isn't played for coins). */
  pot: PotView | null;
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
  | 'banned'
  /** The owner took this game out of service: no new matches. */
  | 'disabled'
  /** A staked match needs at least two players at the table. */
  | 'need_players';

export type RoomResponse = { ok: true; view: RoomView } | { ok: false; code: RoomErrorCode; detail?: string };
