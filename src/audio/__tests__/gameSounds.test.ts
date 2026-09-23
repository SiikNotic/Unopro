import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '@/game/engine';
import type { GameState } from '@/game/engine';
import { num, scenario, drawTwo, wild, wildFour, skip } from '@/game/engine/__tests__/helpers';
import { soundsForChange } from '../gameSounds';

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];
const play = (s: GameState, cardId: string, chosenColor?: 'RED') => applyAction(s, { type: 'PLAY_CARD', playerId: 'p0', cardId, chosenColor }).state;

describe('Game sounds', () => {
  it('a new round shuffles', () => {
    const s = createGame({ players: [{ id: 'a', name: 'a', type: 'HUMAN' }, { id: 'b', name: 'b', type: 'BOT' }], seed: 1 });
    expect(soundsForChange(null, s, 'a')).toContain('roundStart');
  });

  it('each card type has its own sound', () => {
    const cases: [ReturnType<typeof num>, string][] = [
      [num('RED', 3), 'cardPlay'],
      [skip('RED'), 'special'],
      [drawTwo('RED'), 'drawTwo'],
      [wild(), 'wild'],
      [wildFour(), 'drawFour'],
    ];
    for (const [card, sound] of cases) {
      const s = scenario({ hands: [[card, ...fillers()], fillers(), fillers()], top: num('RED', 5), color: 'RED' });
      expect(soundsForChange(s, play(s, card.id, card.color === 'WILD' ? 'RED' : undefined), 'p0')).toContain(sound);
    }
  });

  it('drawing, choosing a color and illegal UNO calls', () => {
    const s = scenario({ hands: [fillers(), fillers()], top: num('RED', 5), deck: [num('GREEN', 9)] });
    expect(soundsForChange(s, applyAction(s, { type: 'DRAW_CARD', playerId: 'p0' }).state, 'p0')).toContain('draw');

    const w = wild();
    const s2 = scenario({ hands: [[w, ...fillers()], fillers()], top: num('RED', 5) });
    const waiting = play(s2, w.id);
    expect(soundsForChange(waiting, applyAction(waiting, { type: 'CHOOSE_COLOR', playerId: 'p0', color: 'BLUE' }).state, 'p0')).toContain('colorPick');

    expect(soundsForChange(s, applyAction(s, { type: 'CALL_UNO', playerId: 'p1' }).state, 'p0')).toEqual(['error']);
  });

  it('victory for the local side, defeat otherwise, and a chime when the turn comes back', () => {
    const last = num('RED', 1);
    const s = scenario({ hands: [[last], fillers(), fillers()], top: num('RED', 5) });
    const over = play(s, last.id);
    expect(soundsForChange(s, over, 'p0')).toContain('victory');
    expect(soundsForChange(s, over, 'p1')).toContain('defeat');

    const s3 = scenario({ hands: [fillers(), [num('RED', 2), ...fillers()]], top: num('RED', 5), current: 1 });
    const back = applyAction(s3, { type: 'PLAY_CARD', playerId: 'p1', cardId: s3.players[1].hand[0].id }).state;
    expect(soundsForChange(s3, back, 'p0')).toContain('turn');
  });
});
