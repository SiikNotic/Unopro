import { describe, expect, it } from 'vitest';
import { playCard } from '../game';
import { getNextPlayerIndex, reverseDirection } from '../effects';
import { currentId, num, ok, reverse, scenario, skip } from './helpers';

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];

describe('Turn order', () => {
  it('starts with the configured current player', () => {
    const s = scenario({ hands: [fillers(), fillers(), fillers(), fillers()], top: num('RED', 5), current: 2 });
    expect(currentId(s)).toBe('p2');
  });

  it('moves to the next player clockwise and wraps around', () => {
    let s = scenario({
      hands: [
        [num('RED', 1), ...fillers()],
        [num('RED', 2), ...fillers()],
        [num('RED', 3), ...fillers()],
        [num('RED', 4), ...fillers()],
      ],
      top: num('RED', 5),
    });
    const order: string[] = [currentId(s)];
    for (let i = 0; i < 4; i++) {
      const player = s.players[s.currentPlayerIndex];
      s = ok(playCard(s, player.id, player.hand[0].id));
      order.push(currentId(s));
    }
    expect(order).toEqual(['p0', 'p1', 'p2', 'p3', 'p0']);
    expect(s.turnNumber).toBe(5);
  });

  it('moves counter-clockwise and wraps around', () => {
    const s = scenario({ hands: [fillers(), fillers(), fillers(), fillers()], top: num('RED', 5), direction: 'COUNTER_CLOCKWISE' });
    expect(getNextPlayerIndex(s, 0)).toBe(3);
    expect(getNextPlayerIndex(s, 3)).toBe(2);
    expect(getNextPlayerIndex(s, 0, 2)).toBe(2);
    expect(reverseDirection('CLOCKWISE')).toBe('COUNTER_CLOCKWISE');
  });
});

describe('Skip', () => {
  it('the next player loses the turn', () => {
    const s = scenario({ hands: [[skip('RED'), ...fillers()], fillers(), fillers(), fillers()], top: num('RED', 5) });
    const next = ok(playCard(s, 'p0', s.players[0].hand[0].id));
    expect(currentId(next)).toBe('p2');
    expect(next.log.some((e) => e.type === 'PLAYER_SKIPPED' && e.playerId === 'p1')).toBe(true);
  });

  it('wraps around the table', () => {
    const s = scenario({ hands: [fillers(), fillers(), fillers(), [skip('RED'), ...fillers()]], top: num('RED', 5), current: 3 });
    expect(currentId(ok(playCard(s, 'p3', s.players[3].hand[0].id)))).toBe('p1');
  });

  it('works counter-clockwise', () => {
    const s = scenario({
      hands: [[skip('RED'), ...fillers()], fillers(), fillers(), fillers()],
      top: num('RED', 5),
      direction: 'COUNTER_CLOCKWISE',
    });
    expect(currentId(ok(playCard(s, 'p0', s.players[0].hand[0].id)))).toBe('p2');
  });
});

describe('Reverse', () => {
  it('A → B → C → D becomes A → D → C → B with 4 players', () => {
    let s = scenario({
      hands: [
        [reverse('RED'), num('RED', 9), ...fillers()],
        fillers(),
        [num('RED', 7), ...fillers()],
        [num('RED', 8), ...fillers()],
      ],
      top: num('RED', 5),
    });
    s = ok(playCard(s, 'p0', s.players[0].hand[0].id));
    expect(s.direction).toBe('COUNTER_CLOCKWISE');
    expect(currentId(s)).toBe('p3');
    s = ok(playCard(s, 'p3', s.players[3].hand[0].id));
    expect(currentId(s)).toBe('p2');
    s = ok(playCard(s, 'p2', s.players[2].hand[0].id));
    expect(currentId(s)).toBe('p1');
    expect(s.log.filter((e) => e.type === 'DIRECTION_CHANGED')).toHaveLength(1);
  });

  it('a second Reverse restores clockwise order', () => {
    let s = scenario({
      hands: [[reverse('RED'), ...fillers()], fillers(), fillers(), [reverse('RED'), ...fillers()]],
      top: num('RED', 5),
    });
    s = ok(playCard(s, 'p0', s.players[0].hand[0].id));
    s = ok(playCard(s, 'p3', s.players[3].hand[0].id));
    expect(s.direction).toBe('CLOCKWISE');
    expect(currentId(s)).toBe('p0');
  });

  it('acts like Skip with two players', () => {
    const s = scenario({ hands: [[reverse('RED'), ...fillers()], fillers()], top: num('RED', 5) });
    const next = ok(playCard(s, 'p0', s.players[0].hand[0].id));
    expect(currentId(next)).toBe('p0');
  });
});
