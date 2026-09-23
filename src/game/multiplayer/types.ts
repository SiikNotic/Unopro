// Transport contract for a future online mode. Nothing implements it yet.
// Remote clients will exchange GameActions and run them through the same engine (applyAction).
import type { GameAction, GameState } from '../engine/types';

export interface GameActionPayload {
  gameId: string;
  action: GameAction;
}

export interface MultiplayerTransport {
  connect(gameId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendAction(payload: GameActionPayload): Promise<void>;
  onAction(handler: (payload: GameActionPayload) => void): void;
  onStateSync(handler: (state: GameState) => void): void;
  isConnected(): boolean;
}
