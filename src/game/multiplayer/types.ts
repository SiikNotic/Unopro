// Re-export engine types that multiplayer code needs.
// All type definitions live in engine/types.ts — this file only adds
// multiplayer-specific transport interfaces.
export type {
  Card,
  CardColor,
  CardDeck,
  GameAction,
  GameActionPayload,
  GameEvent,
  GameEventListener,
  GameSettings,
  MultiplayerRoom,
  Player,
  CardPlayResult,
} from '../engine/types';

// These interfaces are multiplayer-specific and kept here.
import type { GameActionPayload, GameEventListener } from '../engine/types';

export interface MultiplayerTransport {
  connect(gameId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendAction(payload: GameActionPayload): Promise<void>;
  onAction(handler: (payload: GameActionPayload) => void): void;
  onEvent(listener: GameEventListener): void;
  isConnected(): boolean;
}
