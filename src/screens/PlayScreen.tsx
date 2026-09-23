import { useMemo } from 'react';
import { useNavigation } from '@/components/Navigation';
import { GameTable } from '@/components/table/GameTable';
import { useGameEngine } from '@/hooks/useGameEngine';
import { useAutoPlayers } from '@/hooks/useAutoPlayers';
import { placeholderBot } from '@/game/controllers/placeholderBot';
import type { PlayerController } from '@/game/controllers/types';
import { getLocalPlayerId } from '@/game/table/seating';
import type { CreateGameConfig, PlayerType } from '@/game/engine';
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

// Bots are driven by a temporary placeholder until the bots phase replaces it.
const CONTROLLERS: Partial<Record<PlayerType, PlayerController>> = { BOT: placeholderBot };

export function PlayScreen() {
  const { goHome, params } = useNavigation();
  const config = CONFIGS[params.mode ?? 'classic'] ?? CLASSIC;
  const { state, dispatch, error } = useGameEngine(config);
  const localPlayerId = useMemo(() => getLocalPlayerId(state), [state]);
  useAutoPlayers(state, dispatch, CONTROLLERS);

  return <GameTable state={state} localPlayerId={localPlayerId} dispatch={dispatch} onExit={goHome} engineError={error} />;
}
