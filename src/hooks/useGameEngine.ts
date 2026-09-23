import { useCallback, useRef, useState } from 'react';
import { applyAction, createGame } from '@/game/engine';
import type { ActionResult, CreateGameConfig, GameAction, GameState } from '@/game/engine';

/**
 * Thin React binding over the engine: holds the GameState and dispatches actions through applyAction.
 * No game rules live here.
 */
export function useGameEngine(config: CreateGameConfig) {
  const [state, setState] = useState<GameState>(() => createGame(config));
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback((action: GameAction): ActionResult => {
    const result = applyAction(stateRef.current, { ...action, timestamp: Date.now() });
    stateRef.current = result.state;
    setState(result.state);
    setError(result.ok ? null : result.error);
    return result;
  }, []);

  const newGame = useCallback(() => {
    const fresh = createGame(config);
    stateRef.current = fresh;
    setState(fresh);
    setError(null);
  }, [config]);

  return { state, dispatch, error, newGame };
}
