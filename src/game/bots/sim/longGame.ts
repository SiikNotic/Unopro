// Full multi-round games (to the target score) with invariant checks on every action.
import type { GameSettings } from '@/game/engine';
import { applyAction, createGame } from '@/game/engine';
import { getActingPlayerId } from '@/game/controllers/placeholderBot';
import { createBotController } from '../botController';
import type { BotSetup } from '../botController';
import { checkInvariants } from './invariants';

export interface LongGameConfig {
  seed: number;
  players: number;
  teams?: boolean;
  settings?: Partial<GameSettings>;
  setups: BotSetup[];
}

export interface LongGameResult {
  seed: number;
  finished: boolean;
  rounds: number;
  actions: number;
  failure: string | null;
}

const MAX_ACTIONS = 60000;

export function runLongGame(cfg: LongGameConfig): LongGameResult {
  const players = Array.from({ length: cfg.players }, (_, i) => ({
    id: `s${i}`,
    name: `S${i}`,
    type: 'BOT' as const,
    teamId: cfg.teams ? (i % 2 === 0 ? 'A' : 'B') : undefined,
  }));
  let state = createGame({
    players,
    seed: cfg.seed,
    settings: { ...cfg.settings, teamMode: !!cfg.teams },
    teams: cfg.teams
      ? [
          { id: 'A', name: 'A' },
          { id: 'B', name: 'B' },
        ]
      : undefined,
  });
  const controller = createBotController({
    seed: cfg.seed,
    bots: Object.fromEntries(players.map((p, i) => [p.id, cfg.setups[i % cfg.setups.length]])),
  });
  let actions = 0;
  const fail = (failure: string): LongGameResult => ({ seed: cfg.seed, finished: false, rounds: state.roundNumber, actions, failure });

  while (state.status !== 'GAME_OVER') {
    if (++actions > MAX_ACTIONS) return fail(`no game over after ${MAX_ACTIONS} actions`);
    if (state.status === 'ROUND_OVER') {
      const next = applyAction(state, { type: 'START_GAME' });
      if (!next.ok) return fail(`START_GAME rejected: ${next.error}`);
      state = next.state;
      continue;
    }
    const actorId = getActingPlayerId(state);
    if (!actorId) return fail('PLAYING without an acting player');
    const action = controller.decide(state, actorId);
    if (!action) return fail(`stall: ${actorId} returned no action (round ${state.roundNumber}, turn ${state.turnNumber})`);
    const result = applyAction(state, action);
    if (!result.ok) return fail(`illegal ${JSON.stringify(action)}: ${result.error}`);
    const problems = checkInvariants(state, action, result.state);
    if (problems.length) return fail(`${problems.join('; ')} after ${JSON.stringify(action)} (round ${state.roundNumber}, turn ${state.turnNumber})`);
    state = result.state;
  }
  return { seed: cfg.seed, finished: true, rounds: state.roundNumber, actions, failure: null };
}
