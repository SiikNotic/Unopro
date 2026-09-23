// Development configuration for bots. A settings screen can replace this later.
import type { GameModeId } from '@/game/rules/modes';
import type { BotSetup } from './botController';
import type { BotDifficulty } from './profiles';

export interface BotTableConfig {
  bots: Record<string, BotSetup>;
  /** Normal "thinking" time before a bot acts. */
  thinkDelayMs: number;
  /** Longer pause while someone can still be caught without UNO, so a human has a fair chance to react. */
  penaltyWindowDelayMs: number;
}

export const BOT_TABLES: Record<'classic' | 'teams', BotTableConfig> = {
  classic: {
    bots: {
      bot1: { difficulty: 'normal', personality: 'aggressive' },
      bot2: { difficulty: 'hard', personality: 'defensive' },
      bot3: { difficulty: 'easy', personality: 'risky' },
    },
    thinkDelayMs: 750,
    penaltyWindowDelayMs: 1600,
  },
  teams: {
    bots: {
      bot1: { difficulty: 'normal', personality: 'aggressive' },
      bot2: { difficulty: 'hard', personality: 'teamPlayer' }, // your partner
      bot3: { difficulty: 'normal', personality: 'balanced' },
    },
    thinkDelayMs: 750,
    penaltyWindowDelayMs: 1600,
  },
};

export function getBotTable(mode: GameModeId | undefined): BotTableConfig {
  return mode === 'teams' ? BOT_TABLES.teams : BOT_TABLES.classic;
}

/** Applies the difficulty chosen in Settings to every bot, keeping each bot's personality. */
export function withDifficulty(bots: Record<string, BotSetup>, difficulty: BotDifficulty): Record<string, BotSetup> {
  return Object.fromEntries(Object.entries(bots).map(([id, setup]) => [id, { ...setup, difficulty }]));
}
