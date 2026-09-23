import { describe, expect, it } from 'vitest';
import { createGame } from '@/game/engine';
import { createBotController } from '../botController';
import { simulateRound } from './helpers';

describe('Bot determinism', () => {
  it('same state + same seed + same setup → same decision', () => {
    const state = createGame({ players: ['a', 'b', 'c'].map((id) => ({ id, name: id, type: 'BOT' as const })), seed: 9 });
    const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
    const setup = { difficulty: 'easy' as const, personality: 'risky' as const };
    const a = createBotController({ seed: 42, fallback: setup });
    const b = createBotController({ seed: 42, fallback: setup });
    for (let i = 0; i < 5; i++) expect(a.decide(state, actor)).toEqual(b.decide(state, actor));
  });

  it('a whole bot game replays identically from the same seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(simulateRound({ seed }).state).toEqual(simulateRound({ seed }).state);
    }
  });

  it('the bot seed really drives tie-breaks (different seeds can change easy-bot choices)', () => {
    let differences = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGame({ players: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, type: 'BOT' as const })), seed });
      const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
      const setup = { difficulty: 'easy' as const, personality: 'balanced' as const };
      const x = createBotController({ seed: 1, fallback: setup }).decide(state, actor);
      const y = createBotController({ seed: 2, fallback: setup }).decide(state, actor);
      if (JSON.stringify(x) !== JSON.stringify(y)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });
});
