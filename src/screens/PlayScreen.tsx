import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@/components/Navigation';
import { GameTable } from '@/components/table/GameTable';
import { useGameEngine } from '@/hooks/useGameEngine';
import { useAutoPlayers } from '@/hooks/useAutoPlayers';
import { createBotController, getBotTable, withDifficulty } from '@/game/bots';
import type { PlayerController } from '@/game/controllers/types';
import { getLocalPlayerId } from '@/game/table/seating';
import type { CreateGameConfig, GameState, PlayerType } from '@/game/engine';
import type { GameModeId } from '@/game/rules/modes';
import { usePreferences } from '@/settings/usePreferences';
import { pickScenario } from '@/game/scenarios/scenarios';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import { SCENARIO_IDS } from '@/game/scenarios/scenarios';
import { storage } from '@/storage';
import { useGameSounds } from '@/audio/useGameSounds';

const LAST_SCENARIO_KEY = 'carta.lastScenario';

function nextScenario(choice: ScenarioId | 'random'): ScenarioId {
  const stored = storage.get<string>(LAST_SCENARIO_KEY);
  const last = SCENARIO_IDS.includes(stored as ScenarioId) ? (stored as ScenarioId) : null;
  const picked = pickScenario(choice, last);
  storage.set(LAST_SCENARIO_KEY, picked);
  return picked;
}

// Names are language-neutral ids; the table shows localised names ("You", "Bot 1"…).
const CLASSIC: CreateGameConfig = {
  players: [
    { id: 'you', name: 'You', type: 'HUMAN' },
    { id: 'bot1', name: 'Bot 1', type: 'BOT' },
    { id: 'bot2', name: 'Bot 2', type: 'BOT' },
    { id: 'bot3', name: 'Bot 3', type: 'BOT' },
  ],
};

// 2 vs 2: partners sit across from each other (you + Bot 2 vs Bot 1 + Bot 3).
const TEAMS: CreateGameConfig = {
  players: [
    { id: 'you', name: 'You', type: 'HUMAN', teamId: 'A' },
    { id: 'bot1', name: 'Bot 1', type: 'BOT', teamId: 'B' },
    { id: 'bot2', name: 'Bot 2', type: 'BOT', teamId: 'A' },
    { id: 'bot3', name: 'Bot 3', type: 'BOT', teamId: 'B' },
  ],
  teams: [
    { id: 'A', name: 'A' },
    { id: 'B', name: 'B' },
  ],
  settings: { teamMode: true },
};

const CONFIGS: Partial<Record<GameModeId, CreateGameConfig>> = { classic: CLASSIC, teams: TEAMS };

export function PlayScreen() {
  const { goHome, params } = useNavigation();
  const config = CONFIGS[params.mode ?? 'classic'] ?? CLASSIC;
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

  return <GameTable state={state} localPlayerId={localPlayerId} dispatch={dispatch} onExit={goHome} engineError={error} scenario={scenario} />;
}
