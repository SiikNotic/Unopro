import type { GameAction, GameSettings, GameState } from '@/game/engine';
import { applyAction, createGame } from '@/game/engine';
import { getActingPlayerId } from '@/game/controllers/placeholderBot';
import { createBotController } from '../botController';
import type { BotSetup } from '../botController';

export const LINEUPS: BotSetup[] = (['easy', 'normal', 'hard'] as const).flatMap((difficulty) =>
  (['balanced', 'aggressive', 'defensive', 'risky', 'teamPlayer'] as const).map((personality) => ({ difficulty, personality }))
);

export interface SimOptions {
  seed: number;
  players?: number;
  teams?: boolean;
  settings?: Partial<GameSettings>;
  setups?: BotSetup[];
  onDecision?: (state: GameState, action: GameAction) => void;
}

/** Plays one round with bots only, through the real controller and applyAction. */
export function simulateRound({ seed, players = 4, teams = false, settings = {}, setups, onDecision }: SimOptions) {
  const configs = Array.from({ length: players }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    type: 'BOT' as const,
    teamId: teams ? (i % 2 === 0 ? 'A' : 'B') : undefined,
  }));
  let state = createGame({
    players: configs,
    seed,
    settings: { ...settings, teamMode: teams },
    teams: teams
      ? [
          { id: 'A', name: 'A' },
          { id: 'B', name: 'B' },
        ]
      : undefined,
  });
  const controller = createBotController({
    seed,
    bots: Object.fromEntries(configs.map((c, i) => [c.id, setups?.[i % setups.length] ?? LINEUPS[(seed + i) % LINEUPS.length]])),
  });
  let steps = 0;
  while (state.status === 'PLAYING') {
    if (++steps > 4000) throw new Error(`Seed ${seed}: round did not finish`);
    const actor = getActingPlayerId(state)!;
    const action = controller.decide(state, actor);
    if (!action) throw new Error(`Seed ${seed}: ${actor} had no action`);
    onDecision?.(state, action);
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`Seed ${seed}: invalid ${action.type}: ${result.error}`);
    state = result.state;
  }
  return { state, steps };
}
