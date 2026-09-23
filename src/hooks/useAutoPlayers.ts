import { useEffect } from 'react';
import type { ActionResult, GameAction, GameState, PlayerType } from '@/game/engine';
import type { PlayerController } from '@/game/controllers/types';
import { getActingPlayerId } from '@/game/controllers/placeholderBot';

/**
 * Lets controllers (bots now, remote peers later) act for the players they own.
 * After each state change, if the acting player has a controller, its decision is dispatched after
 * `delayMs` (a number, or a function of the state for context-dependent pacing).
 */
export function useAutoPlayers(
  state: GameState,
  dispatch: (action: GameAction) => ActionResult,
  controllers: Partial<Record<PlayerType, PlayerController>>,
  delayMs: number | ((state: GameState) => number) = 750
) {
  useEffect(() => {
    const actorId = getActingPlayerId(state);
    const actor = state.players.find((p) => p.id === actorId);
    const controller = actor && controllers[actor.type];
    if (!actor || !controller) return;
    const delay = typeof delayMs === 'function' ? delayMs(state) : delayMs;
    const timer = window.setTimeout(() => {
      const action = controller.decide(state, actor.id);
      if (action) dispatch(action);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state, dispatch, controllers, delayMs]);
}
