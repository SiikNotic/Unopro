import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { GameTable } from '@/components/table/GameTable';
import { useGameEngine } from '@/hooks/useGameEngine';
import { useAutoPlayers } from '@/hooks/useAutoPlayers';
import { createBotController, getBotTable, withDifficulty } from '@/game/bots';
import type { PlayerController } from '@/game/controllers/types';
import { getLocalPlayerId } from '@/game/table/seating';
import type { GameState, PlayerType } from '@/game/engine';
import { usePreferences } from '@/settings/usePreferences';
import { pickScenario } from '@/game/scenarios/scenarios';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import { SCENARIO_IDS } from '@/game/scenarios/scenarios';
import { storage } from '@/storage';
import { useGameSounds } from '@/audio/useGameSounds';
import { loadCartaSetup } from '@/games/shared/setup';
import { cartaConfig } from '@/game/rules/cartaConfig';

const LAST_SCENARIO_KEY = 'carta.lastScenario';

function nextScenario(choice: ScenarioId | 'random'): ScenarioId {
  const stored = storage.get<string>(LAST_SCENARIO_KEY);
  const last = SCENARIO_IDS.includes(stored as ScenarioId) ? (stored as ScenarioId) : null;
  const picked = pickScenario(choice, last);
  storage.set(LAST_SCENARIO_KEY, picked);
  return picked;
}

export function PlayScreen() {
  const { back, params } = useNavigation();
  const [config] = useState(() => cartaConfig(loadCartaSetup(), params.mode));
  const { state, dispatch, error } = useGameEngine(config);
  const localPlayerId = useMemo(() => getLocalPlayerId(state), [state]);

  const { preferences } = usePreferences();

  // One scenario per game: picked when the game starts, kept for every round, re-picked on "New game".
  const [scenario, setScenario] = useState<ScenarioId>(() => nextScenario(preferences.scenario));
  const hadRounds = useRef(false);
  useEffect(() => {
    if (state.rounds.length > 0) hadRounds.current = true;
    else if (hadRounds.current && state.roundNumber === 1) {
      hadRounds.current = false;
      setScenario(nextScenario(preferences.scenario));
    }
  }, [state.rounds.length, state.roundNumber, preferences.scenario]);

  useGameSounds(state, localPlayerId);

  // Bot strategy lives entirely in the controller; the table only ever sees the actions it produces.
  // The Settings difficulty replaces each bot's difficulty; personalities stay as configured.
  const botTable = getBotTable(params.mode);
  const bots = useMemo(() => withDifficulty(botTable.bots, preferences.difficulty), [botTable, preferences.difficulty]);
  const controllers = useMemo<Partial<Record<PlayerType, PlayerController>>>(
    () => ({ BOT: createBotController({ bots, seed: state.seed }) }),
    [bots, state.seed]
  );
  const thinkDelay = useCallback(
    (s: GameState) => {
      const unoWindow = s.unoState.penaltyWindowPlayerId;
      const actor = s.pendingAction?.playerId ?? s.players[s.currentPlayerIndex].id;
      return unoWindow && unoWindow !== actor ? botTable.penaltyWindowDelayMs : botTable.thinkDelayMs;
    },
    [botTable]
  );
  useAutoPlayers(state, dispatch, controllers, thinkDelay);

  return <GameTable state={state} localPlayerId={localPlayerId} dispatch={dispatch} onExit={() => back('cartaSetup')} engineError={error} scenario={scenario} />;
}
