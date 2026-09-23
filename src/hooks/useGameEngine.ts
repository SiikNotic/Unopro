import { useCallback, useState } from 'react';
import { applyAction, createGame } from '@/game/engine';
import type { CreateGameConfig, GameAction, GameState } from '@/game/engine';

/**
 * Thin React binding over the engine: holds the GameState and dispatches actions through applyAction.
 * No game rules live here.
 */
export function useGameEngine(config: CreateGameConfig) {
  const [state, setState] = useState<GameState>(() => createGame(config));
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback((action: GameAction) => {
    setState((current) => {
      const result = applyAction(current, { ...action, timestamp: Date.now() });
      setError(result.ok ? null : result.error);
      return result.state;
    });
  }, []);

  const newGame = useCallback(() => {
    setState(createGame(config));
    setError(null);
  }, [config]);

  return { state, dispatch, error, newGame };
}
