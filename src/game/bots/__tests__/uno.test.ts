import { describe, expect, it } from 'vitest';
import { applyAction, createRng } from '@/game/engine';
import { num, scenario } from '@/game/engine/__tests__/helpers';
import { createPlayerView } from '../playerView';
import { resolveProfile } from '../profiles';
import type { BotDifficulty } from '../profiles';
import { chooseAction } from '../strategy';
import { simulateRound } from './helpers';

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];
const twoCards = () => scenario({ hands: [[num('RED', 1), num('GREEN', 8)], fillers(), fillers()], top: num('RED', 5) });

function callRate(difficulty: BotDifficulty) {
  const s = twoCards();
  let calls = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const action = chooseAction(createPlayerView(s, 'p0'), resolveProfile(difficulty, 'balanced'), createRng(seed));
    if (action?.type === 'CALL_UNO') calls++;
  }
  return calls / 400;
}

describe('Bot UNO behaviour', () => {
  it('calls UNO before playing its second-to-last card', () => {
    const s = twoCards();
    const action = chooseAction(createPlayerView(s, 'p0'), resolveProfile('hard', 'balanced'), createRng(1));
    expect(action).toEqual({ type: 'CALL_UNO', playerId: 'p0' });
    const called = applyAction(s, action!).state;
    expect(called.unoState.declaredPlayerIds).toContain('p0');
    // Next decision plays a card instead of calling again.
    expect(chooseAction(createPlayerView(called, 'p0'), resolveProfile('hard', 'balanced'), createRng(1))?.type).toBe('PLAY_CARD');
  });

  it('sometimes forgets, more often the easier it is', () => {
    const easy = callRate('easy');
    const normal = callRate('normal');
    const hard = callRate('hard');
    expect(easy).toBeGreaterThan(0.35);
    expect(easy).toBeLessThan(0.75);
    expect(normal).toBeGreaterThan(easy);
    expect(normal).toBeLessThan(1);
    expect(hard).toBeGreaterThan(normal);
    expect(hard).toBeLessThan(1);
  });

  it('catches an opponent who forgot to call UNO', () => {
    const s = twoCards();
    const forgot = applyAction(s, { type: 'PLAY_CARD', playerId: 'p0', cardId: s.players[0].hand[0].id }).state;
    expect(forgot.unoState.penaltyWindowPlayerId).toBe('p0');
    const action = chooseAction(createPlayerView(forgot, 'p1'), resolveProfile('hard', 'balanced'), createRng(2));
    expect(action).toEqual({ type: 'CHALLENGE_UNO', playerId: 'p1', targetId: 'p0' });
    expect(applyAction(forgot, action!).state.players[0].hand).toHaveLength(3);
  });

  it('forgets and gets caught in real bot games', () => {
    let penalties = 0;
    let calls = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = simulateRound({ seed, setups: [{ difficulty: 'easy', personality: 'balanced' }, { difficulty: 'hard', personality: 'balanced' }] });
      penalties += state.log.filter((e) => e.type === 'UNO_PENALTY').length;
      calls += state.unoState.calls.length;
    }
    expect(calls).toBeGreaterThan(0);
    expect(penalties).toBeGreaterThan(0);
  });
});
