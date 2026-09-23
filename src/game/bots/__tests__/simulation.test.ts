import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '@/game/engine';
import { getActingPlayerId } from '@/game/controllers/placeholderBot';
import { createBotController } from '../botController';
import { LINEUPS, simulateRound } from './helpers';

describe('Bot simulations', () => {
  it('finish 150 rounds (2-6 players, every difficulty and personality) with only legal actions', () => {
    let totalSteps = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { state, steps } = simulateRound({ seed, players: 2 + (seed % 5) });
      expect(state.status).toBe('ROUND_OVER');
      totalSteps += steps;
    }
    expect(totalSteps / 150).toBeLessThan(400);
  });

  it('finish rounds with every house rule enabled', () => {
    const settings = { stacking: true, jumpIn: true, drawUntilPlayable: true, forcePlay: true };
    for (let seed = 1; seed <= 40; seed++) {
      expect(simulateRound({ seed, settings }).state.status).toBe('ROUND_OVER');
    }
  });

  it('play a long multi-round game to the target score', () => {
    const players = ['you', 'bot1', 'bot2', 'bot3'].map((id) => ({ id, name: id, type: 'BOT' as const }));
    let state = createGame({ players, seed: 2024 });
    const controller = createBotController({ seed: 2024, fallback: LINEUPS[7] });
    let actions = 0;
    while (state.status !== 'GAME_OVER') {
      if (++actions > 20000) throw new Error('Game did not finish');
      if (state.status === 'ROUND_OVER') {
        state = applyAction(state, { type: 'START_GAME' }).state;
        continue;
      }
      const action = controller.decide(state, getActingPlayerId(state)!)!;
      const result = applyAction(state, action);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(state.rounds.length).toBeGreaterThan(1);
    expect(state.scores[state.gameWinnerId!]).toBeGreaterThanOrEqual(500);
  });

  it('harder bots win more often than easy ones', () => {
    const hard = { difficulty: 'hard' as const, personality: 'balanced' as const };
    const easy = { difficulty: 'easy' as const, personality: 'balanced' as const };
    let hardWins = 0;
    const games = 200;
    for (let seed = 1; seed <= games; seed++) {
      const { state } = simulateRound({ seed, setups: [hard, easy, hard, easy] });
      if (state.winnerId === 'p0' || state.winnerId === 'p2') hardWins++;
    }
    expect(hardWins / games).toBeGreaterThan(0.58);
  });
});
