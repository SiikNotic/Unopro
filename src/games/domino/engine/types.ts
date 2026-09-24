// Domino — data model. Pure data: serialisable, no functions, no React.
import type { SeatKind } from '@/games/shared/multiplayer/types';

export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A tile is identified by its pips (low-high): "3-5". Ids encode the face, so hands are private. */
export interface Tile {
  id: string;
  a: Pip;
  b: Pip;
}

export type End = 'left' | 'right';

/** A tile on the table, in line order. `left`/`right` are the pips facing each end of the line. */
export interface PlacedTile {
  tile: Tile;
  left: Pip;
  right: Pip;
  by: string;
  /** Order in which tiles were played this round (0 = the lead). */
  seq: number;
}

export interface DominoPlayer {
  id: string;
  name: string;
  kind: SeatKind;
  hand: Tile[];
}

export interface DominoSettings {
  /** First to reach it (at the end of a round) wins the match. */
  targetScore: number;
}

export type DominoStatus = 'playing' | 'round_over' | 'game_over';

export interface RoundResult {
  round: number;
  /** null when a blocked round ends tied for the lowest hand. */
  winnerId: string | null;
  reason: 'domino' | 'blocked';
  points: number;
  /** Pips left in every hand when the round ended. */
  pips: Record<string, number>;
}

export interface DominoState {
  version: 1;
  seed: number;
  rngState: number;
  round: number;
  status: DominoStatus;
  settings: DominoSettings;
  players: DominoPlayer[];
  /** Undealt tiles, already shuffled; draws take from the front. */
  boneyard: Tile[];
  line: PlacedTile[];
  current: number;
  /** Tile that must open round 1 (the highest double, or highest tile); null afterwards. */
  mustLead: string | null;
  /**
   * Public knowledge: pips a player showed they do not hold (they drew or passed while those pips were
   * the open ends). Everyone at a real table sees this, so bots may use it.
   */
  lacks: Record<string, Pip[]>;
  scores: Record<string, number>;
  lastResult: RoundResult | null;
  /** Winners of the match (more than one only if they finish tied). */
  matchWinners: string[];
  /** Increments on every applied action. */
  turn: number;
}

export type DominoAction =
  | { type: 'PLAY_TILE'; playerId: string; tileId: string; end: End }
  | { type: 'DRAW'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'NEXT_ROUND'; playerId: string };

export type DominoEvent =
  | { type: 'dealt'; round: number; leaderId: string }
  | { type: 'played'; playerId: string; tileId: string; end: End; seq: number }
  | { type: 'drew'; playerId: string }
  | { type: 'passed'; playerId: string }
  | { type: 'turn'; playerId: string }
  | { type: 'round_over'; result: RoundResult }
  | { type: 'game_over'; winners: string[] };

export type DominoError =
  | 'not_playing'
  | 'unknown_player'
  | 'not_your_turn'
  | 'tile_not_in_hand'
  | 'must_lead'
  | 'no_match'
  | 'must_play'
  | 'boneyard_empty'
  | 'must_draw'
  | 'round_not_over';

export interface DominoSeatConfig {
  id: string;
  name: string;
  kind: SeatKind;
}

export interface DominoConfig {
  seats: DominoSeatConfig[];
  seed: number;
  targetScore?: number;
}
