import { describe, expect, it } from 'vitest';
import { applyAction, createRng, validateAction } from '@/game/engine';
import type { GameAction } from '@/game/engine';
import { num, scenario, skip, drawTwo, wild, wildFour, reverse } from '@/game/engine/__tests__/helpers';
import { createPlayerView } from '../playerView';
import { resolveProfile } from '../profiles';
import type { BotDifficulty, BotPersonality } from '../profiles';
import { chooseAction } from '../strategy';
import { LINEUPS, simulateRound } from './helpers';

const decide = (state: Parameters<typeof createPlayerView>[0], playerId: string, difficulty: BotDifficulty = 'hard', personality: BotPersonality = 'balanced', seed = 1): GameAction | null =>
  chooseAction(createPlayerView(state, playerId), resolveProfile(difficulty, personality), createRng(seed));

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];

describe('Bot legality', () => {
  it('never proposes an illegal action (strategy output checked before any fallback)', () => {
    let decisions = 0;
    for (let seed = 1; seed <= 60; seed++) {
      simulateRound({
        seed,
        players: 2 + (seed % 4),
        onDecision: (state) => {
          const actor = state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
          const setup = LINEUPS[seed % LINEUPS.length];
          const action = decide(state, actor, setup.difficulty, setup.personality, seed + state.log.length);
          expect(action).not.toBeNull();
          expect(validateAction(state, action!)).toEqual({ valid: true });
          decisions++;
        },
      });
    }
    expect(decisions).toBeGreaterThan(2000);
  });

  it('plays a legal card when it has one', () => {
    const s = scenario({ hands: [[num('GREEN', 4), num('RED', 2), num('YELLOW', 9)], fillers()], top: num('RED', 5) });
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(decide(s, 'p0', d)).toMatchObject({ type: 'PLAY_CARD', cardId: s.players[0].hand[1].id });
    }
  });

  it('draws when it cannot play', () => {
    const s = scenario({ hands: [[num('GREEN', 4), num('YELLOW', 9)], fillers()], top: num('RED', 5) });
    expect(decide(s, 'p0')).toEqual({ type: 'DRAW_CARD', playerId: 'p0' });
  });

  it('names a color when playing a Wild, and the engine accepts it', () => {
    const w = wild();
    const s = scenario({ hands: [[w, num('GREEN', 4), num('GREEN', 7), num('YELLOW', 1)], fillers()], top: num('RED', 5) });
    const action = decide(s, 'p0');
    expect(action).toMatchObject({ type: 'PLAY_CARD', cardId: w.id, chosenColor: 'GREEN' });
    expect(applyAction(s, action!).state.currentColor).toBe('GREEN');
  });

  it('answers a pending color choice (e.g. Wild starting card)', () => {
    const s = scenario({ hands: [[num('YELLOW', 4), num('YELLOW', 7), skip('YELLOW')], fillers()], top: wild() });
    s.pendingAction = { type: 'CHOOSE_COLOR', playerId: 'p0', cardId: s.discardPile[0].id, reason: 'STARTING_CARD' };
    s.currentColor = null;
    expect(decide(s, 'p0')).toEqual({ type: 'CHOOSE_COLOR', playerId: 'p0', color: 'YELLOW' });
    expect(decide(s, 'p1')).toBeNull();
  });

  it('prefers a Skip / +2 against an opponent about to win', () => {
    const attack = drawTwo('RED');
    const s = scenario({
      hands: [[num('RED', 7), attack, num('BLUE', 4), num('GREEN', 6)], [num('YELLOW', 1)], fillers()],
      top: num('RED', 5),
    });
    expect(decide(s, 'p0', 'normal')).toMatchObject({ type: 'PLAY_CARD', cardId: attack.id });
    expect(decide(s, 'p0', 'hard', 'aggressive')).toMatchObject({ type: 'PLAY_CARD', cardId: attack.id });
  });

  it('keeps a Wild when a normal card will do', () => {
    const s = scenario({ hands: [[wild(), num('RED', 3), num('BLUE', 2), num('BLUE', 8)], fillers(), fillers()], top: num('RED', 5) });
    const action = decide(s, 'p0', 'normal', 'defensive');
    expect(action).toMatchObject({ type: 'PLAY_CARD', cardId: s.players[0].hand[1].id });
  });

  it('uses Wild Draw Four and Reverse correctly through the engine', () => {
    const w4 = wildFour();
    const s = scenario({ hands: [[w4, num('BLUE', 2), num('BLUE', 8)], [num('YELLOW', 1)], fillers()], top: num('RED', 5), color: 'RED' });
    const action = decide(s, 'p0');
    expect(action).toMatchObject({ type: 'PLAY_CARD', cardId: w4.id, chosenColor: 'BLUE' });
    const after = applyAction(s, action!).state;
    expect(after.players[1].hand).toHaveLength(5);

    const rev = reverse('RED');
    const s2 = scenario({ hands: [[rev, num('GREEN', 2), num('GREEN', 8)], fillers(), fillers()], top: num('RED', 5) });
    expect(applyAction(s2, decide(s2, 'p0')!).ok).toBe(true);
  });

  it('after drawing a playable card it plays it or passes — both legal', () => {
    const drawn = num('RED', 9);
    const s = scenario({ hands: [[num('GREEN', 1), num('GREEN', 2)], fillers()], top: num('RED', 5), deck: [drawn] });
    const waiting = applyAction(s, { type: 'DRAW_CARD', playerId: 'p0' }).state;
    const action = decide(waiting, 'p0');
    expect(['PLAY_CARD', 'END_TURN']).toContain(action!.type);
    expect(validateAction(waiting, action!).valid).toBe(true);
  });

  it('does nothing when it is not its move', () => {
    const s = scenario({ hands: [fillers(), fillers()], top: num('RED', 5) });
    expect(decide(s, 'p1')).toBeNull();
    expect(decide({ ...s, status: 'ROUND_OVER' }, 'p0')).toBeNull();
  });
});
