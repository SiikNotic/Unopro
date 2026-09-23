import { describe, expect, it } from 'vitest';
import { applyAction, endTurn, playCard } from '../game';
import { validateAction } from '../validation';
import type { CardColor } from '../types';
import { currentId, num, ok, scenario, wild } from './helpers';

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];

describe('Action validation', () => {
  const valid = num('RED', 2);
  const invalid = num('GREEN', 3);
  const base = () => scenario({ hands: [[valid, invalid, ...fillers()], [num('RED', 9), ...fillers()], fillers()], top: num('RED', 5) });

  it('accepts a valid card', () => {
    expect(validateAction(base(), { type: 'PLAY_CARD', playerId: 'p0', cardId: valid.id })).toEqual({ valid: true });
  });

  it('rejects an invalid card and leaves the state untouched', () => {
    const s = base();
    const result = playCard(s, 'p0', invalid.id);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(s);
    if (!result.ok) expect(result.error).toMatch(/cannot be played/);
  });

  it('rejects a player acting out of turn', () => {
    const s = base();
    const result = playCard(s, 'p1', s.players[1].hand[0].id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not P1's turn/);
    expect(applyAction(s, { type: 'DRAW_CARD', playerId: 'p2' }).ok).toBe(false);
  });

  it('rejects a card that is not in the hand', () => {
    const s = base();
    const result = playCard(s, 'p0', s.players[1].hand[0].id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not in P0's hand/);
  });

  it('rejects unknown players and invalid colors', () => {
    const s = scenario({ hands: [[wild(), ...fillers()], fillers()], top: num('RED', 5) });
    expect(playCard(s, 'nobody', 'x').ok).toBe(false);
    expect(playCard(s, 'p0', s.players[0].hand[0].id, 'PURPLE' as CardColor).ok).toBe(false);
  });

  it('rejects ending the turn without having drawn', () => {
    expect(endTurn(base(), 'p0').ok).toBe(false);
  });

  it('rejects play once the round is over', () => {
    const s = { ...base(), status: 'ROUND_OVER' as const };
    expect(playCard(s, 'p0', valid.id).ok).toBe(false);
  });

  it('never mutates the input state', () => {
    const s = base();
    const snapshot = structuredClone(s);
    const next = ok(playCard(s, 'p0', valid.id));
    expect(s).toEqual(snapshot);
    expect(currentId(next)).toBe('p1');
  });
});

describe('Jump-in (house rule)', () => {
  it('is rejected with official rules', () => {
    const top = num('RED', 5);
    const twin = num('RED', 5);
    const s = scenario({ hands: [fillers(), fillers(), [twin, ...fillers()]], top });
    expect(playCard(s, 'p2', twin.id).ok).toBe(false);
  });

  it('lets an identical card be played out of turn and continues from that player', () => {
    const twin = num('RED', 5);
    const s = scenario({ hands: [fillers(), fillers(), [twin, ...fillers()], fillers()], top: num('RED', 5), settings: { jumpIn: true } });
    const next = ok(playCard(s, 'p2', twin.id));
    expect(currentId(next)).toBe('p3');
    expect(next.log.some((e) => e.type === 'PLAYER_JUMPED_IN')).toBe(true);
    // Same number but a different color is not identical.
    const other = num('BLUE', 5);
    const s2 = scenario({ hands: [fillers(), [other, ...fillers()]], top: num('RED', 5), settings: { jumpIn: true } });
    expect(playCard(s2, 'p1', other.id).ok).toBe(false);
  });
});
