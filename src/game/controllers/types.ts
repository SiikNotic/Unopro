import type { GameAction, GameState } from '@/game/engine';

/**
 * Something that decides actions for a non-local player (a bot today, a remote peer later).
 * It only proposes a GameAction; the engine (applyAction) validates and applies it.
 */
export interface PlayerController {
  decide(state: GameState, playerId: string): GameAction | null;
}
