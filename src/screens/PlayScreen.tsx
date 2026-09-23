import { useCallback, useMemo } from 'react';
import { useNavigation } from '@/components/Navigation';
import { GameTable } from '@/components/table/GameTable';
import { useGameEngine } from '@/hooks/useGameEngine';
import { useAutoPlayers } from '@/hooks/useAutoPlayers';
import { createBotController, getBotTable } from '@/game/bots';
import type { PlayerController } from '@/game/controllers/types';
import { getLocalPlayerId } from '@/game/table/seating';
import type { CreateGameConfig, GameState, PlayerType } from '@/game/engine';
import type { GameModeId } from '@/game/rules/modes';

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

  // Bot strategy lives entirely in the controller; the table only ever sees the actions it produces.
  const botTable = getBotTable(params.mode);
  const controllers = useMemo<Partial<Record<PlayerType, PlayerController>>>(
    () => ({ BOT: createBotController({ bots: botTable.bots, seed: state.seed }) }),
    [botTable, state.seed]
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

  return <GameTable state={state} localPlayerId={localPlayerId} dispatch={dispatch} onExit={goHome} engineError={error} />;
}
