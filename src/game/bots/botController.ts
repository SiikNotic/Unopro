import type { GameAction, GameState } from '@/game/engine';
import { createRng, validateAction } from '@/game/engine';
import type { PlayerController } from '@/game/controllers/types';
import { placeholderBot } from '@/game/controllers/placeholderBot';
import { createPlayerView } from './playerView';
import { resolveProfile } from './profiles';
import type { BotDifficulty, BotPersonality } from './profiles';
import { chooseAction } from './strategy';

export interface BotSetup {
  difficulty: BotDifficulty;
  personality: BotPersonality;
}

export interface BotControllerConfig {
  /** Per-player setup; players not listed use `fallback`. */
  bots?: Record<string, BotSetup>;
  fallback?: BotSetup;
  /** Entropy for tie-breaks and mistakes. Same seed + same state → same decision. */
  seed: number;
}

/** FNV-1a — turns the decision context into a 32-bit seed. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Builds the real bot controller. Each decision:
 * 1. projects the GameState to what that player may see (createPlayerView),
 * 2. seeds a PRNG from the bot seed + public position in the game (never the engine's PRNG),
 * 3. lets the strategy pick among engine-validated actions,
 * 4. double-checks the action against the real state with validateAction.
 */
export function createBotController(config: BotControllerConfig): PlayerController {
  const fallback: BotSetup = config.fallback ?? { difficulty: 'normal', personality: 'balanced' };
  const profiles = new Map<string, ReturnType<typeof resolveProfile>>();
  const profileFor = (playerId: string) => {
    let profile = profiles.get(playerId);
    if (!profile) {
      const setup = config.bots?.[playerId] ?? fallback;
      profile = resolveProfile(setup.difficulty, setup.personality);
      profiles.set(playerId, profile);
    }
    return profile;
  };

  return {
    decide(state: GameState, playerId: string): GameAction | null {
      const view = createPlayerView(state, playerId);
      const rng = createRng(hash(`${config.seed}|${playerId}|${state.roundNumber}|${state.turnNumber}|${state.log.length}`));
      const action = chooseAction(view, profileFor(playerId), rng);
      if (action && validateAction(state, action).valid) return action;
      // Should never happen (covered by tests); keeps the table moving instead of stalling if it ever does.
      // The fallback also only sees the player's view.
      const fallbackAction = placeholderBot.decide(view.state, playerId);
      return fallbackAction && validateAction(state, fallbackAction).valid ? fallbackAction : null;
    },
  };
}
