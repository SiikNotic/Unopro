// Bingo (75 balls) — data model. Pure, serialisable data.
import type { SeatKind } from '@/games/shared/multiplayer/types';

export const CELLS = 25;
export const CENTER = 12;
export const BALLS = 75;
export const LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;

export interface BingoPlayer {
  id: string;
  name: string;
  kind: SeatKind;
  /** 25 numbers, row by row; the centre (index 12) is 0 = FREE. */
  card: number[];
  /** Daubed cells; the FREE centre starts daubed. */
  marks: boolean[];
}

export type BingoStatus = 'playing' | 'closing' | 'round_over';

export interface BingoResult {
  round: number;
  winners: string[];
  /** How many numbers had been called when the first valid BINGO was claimed (0 = nobody won). */
  atCall: number;
  pointsEach: number;
}

export interface BingoState {
  version: 1;
  seed: number;
  rngState: number;
  round: number;
  status: BingoStatus;
  players: BingoPlayer[];
  /** This round's whole ball order (secret); `called` is the public prefix. */
  drawOrder: number[];
  called: number[];
  /** Valid claims this round, in order. */
  winners: string[];
  /** After a false BINGO a player may not claim again until this many numbers have been called. */
  claimBlockedUntil: Record<string, number>;
  scores: Record<string, number>;
  lastResult: BingoResult | null;
  turn: number;
}

export type BingoAction =
  | { type: 'CALL_NUMBER' }
  | { type: 'CLOSE_ROUND' }
  | { type: 'MARK_NUMBER'; playerId: string; number: number }
  | { type: 'CLAIM'; playerId: string }
  | { type: 'NEXT_ROUND'; playerId: string };

export type BingoEvent =
  | { type: 'dealt'; round: number }
  | { type: 'called'; number: number; count: number }
  | { type: 'marked'; playerId: string; number: number }
  | { type: 'claimed'; playerId: string; valid: boolean }
  | { type: 'round_over'; result: BingoResult };

export type BingoError = 'not_playing' | 'unknown_player' | 'no_balls' | 'closing' | 'not_on_card' | 'not_called' | 'already_marked' | 'claim_blocked' | 'already_claimed' | 'cannot_close' | 'round_not_over';

export interface BingoConfig {
  seats: { id: string; name: string; kind: SeatKind }[];
  seed: number;
}
