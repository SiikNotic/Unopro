import { describe, expect, it } from 'vitest';
import { BOT_TABLES, withDifficulty } from '../config';
import { createBotController } from '../botController';
import { createGame, validateAction } from '@/game/engine';

describe('Settings difficulty', () => {
  it('replaces every bot difficulty and keeps personalities', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const bots = withDifficulty(BOT_TABLES.classic.bots, level);
      for (const [id, setup] of Object.entries(bots)) {
        expect(setup.difficulty).toBe(level);
        expect(setup.personality).toBe(BOT_TABLES.classic.bots[id].personality);
      }
    }
  });

  it('bots built with each difficulty still only propose legal actions', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const state = createGame({
        players: ['you', 'bot1', 'bot2', 'bot3'].map((id) => ({ id, name: id, type: id === 'you' ? ('HUMAN' as const) : ('BOT' as const) })),
        seed: 3,
      });
      const controller = createBotController({ seed: 3, bots: withDifficulty(BOT_TABLES.classic.bots, level) });
      const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
      const action = controller.decide(state, actor === 'you' ? 'bot1' : actor);
      if (action) expect(validateAction(state, action).valid).toBe(true);
    }
  });
});
