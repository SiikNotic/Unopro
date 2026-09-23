import { describe, expect, it } from 'vitest';
import { callUno, challengeUno, drawCards, playCard } from '../game';
import { getLastUnoCall } from '../uno';
import { num, ok, scenario } from './helpers';

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];

function twoCardScenario() {
  const a = num('RED', 1);
  const b = num('GREEN', 8);
  const s = scenario({
    hands: [[a, b], [num('RED', 2), ...fillers()], fillers()],
    top: num('RED', 5),
    deck: [num('YELLOW', 4), num('YELLOW', 6)],
  });
  return { s, a, b };
}

describe('UNO', () => {
  it('a player with 2 cards is not in UNO state', () => {
    const { s } = twoCardScenario();
    expect(s.unoState.playersWithOneCard).toEqual([]);
    expect(s.unoState.penaltyWindowPlayerId).toBeNull();
  });

  it('playing down to 1 card without calling UNO opens the penalty window', () => {
    const { s, a } = twoCardScenario();
    const next = ok(playCard(s, 'p0', a.id));
    expect(next.players[0].cardsRemaining).toBe(1);
    expect(next.unoState.playersWithOneCard).toEqual(['p0']);
    expect(next.unoState.penaltyWindowPlayerId).toBe('p0');
  });

  it('a valid call with 1 card protects the player and is recorded', () => {
    const { s, a } = twoCardScenario();
    const one = ok(playCard(s, 'p0', a.id));
    const called = ok(callUno({ ...one }, 'p0'));
    expect(called.unoState.declaredPlayerIds).toEqual(['p0']);
    expect(called.unoState.penaltyWindowPlayerId).toBeNull();
    expect(getLastUnoCall(called)).toMatchObject({ playerId: 'p0', valid: true, turnNumber: one.turnNumber });
    expect(called.log.at(-1)?.type).toBe('PLAYER_CALLED_UNO');
    expect(challengeUno(called, 'p1', 'p0').ok).toBe(false);
  });

  it('calling UNO with 2 cards on your own turn counts as announcing it before playing', () => {
    const { s, a } = twoCardScenario();
    const called = ok(callUno(s, 'p0'));
    expect(getLastUnoCall(called)?.valid).toBe(true);
    const next = ok(playCard(called, 'p0', a.id));
    expect(next.unoState.penaltyWindowPlayerId).toBeNull();
    expect(next.unoState.declaredPlayerIds).toEqual(['p0']);
  });

  it('an invalid call is recorded as invalid', () => {
    const s = scenario({ hands: [fillers(), fillers()], top: num('RED', 5) });
    const called = ok(callUno(s, 'p1'));
    expect(getLastUnoCall(called)).toMatchObject({ playerId: 'p1', valid: false });
    expect(called.unoState.declaredPlayerIds).toEqual([]);
    expect(called.players[1].hand).toHaveLength(3);
  });

  it('a player caught without calling UNO draws the penalty', () => {
    const { s, a } = twoCardScenario();
    const one = ok(playCard(s, 'p0', a.id));
    const caught = ok(challengeUno(one, 'p2', 'p0'));
    expect(caught.players[0].hand).toHaveLength(3);
    expect(caught.unoState.playersWithOneCard).toEqual([]);
    expect(caught.unoState.penaltyWindowPlayerId).toBeNull();
    expect(caught.log.at(-1)).toMatchObject({ type: 'UNO_PENALTY', playerId: 'p0', amount: 2 });
  });

  it('the penalty window closes once the next player acts', () => {
    const { s, a } = twoCardScenario();
    const one = ok(playCard(s, 'p0', a.id));
    const after = ok(playCard(one, 'p1', one.players[1].hand[0].id));
    expect(after.unoState.penaltyWindowPlayerId).toBeNull();
    expect(challengeUno(after, 'p2', 'p0').ok).toBe(false);
  });

  it('drawing cards clears the UNO state', () => {
    const lone = num('GREEN', 8);
    const s = scenario({ hands: [[lone], fillers()], top: num('RED', 5), deck: [num('YELLOW', 4)] });
    s.unoState.playersWithOneCard = ['p0'];
    s.unoState.declaredPlayerIds = ['p0'];
    const next = ok(drawCards(s, 'p0'));
    expect(next.unoState.playersWithOneCard).toEqual([]);
    expect(next.unoState.declaredPlayerIds).toEqual([]);
  });

  it('the penalty can be disabled', () => {
    const { s, a } = twoCardScenario();
    const one = ok(playCard({ ...s, settings: { ...s.settings, unoPenalty: 0 } }, 'p0', a.id));
    expect(challengeUno(one, 'p1', 'p0').ok).toBe(false);
  });
});
