import { describe, expect, it } from 'vitest';
import { chooseColor, drawCards, playCard } from '../game';
import { canPlayCard } from '../validation';
import { currentId, drawTwo, num, ok, scenario, skip, wild, wildFour } from './helpers';

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];

describe('Number cards', () => {
  it('match by color', () => {
    const card = num('RED', 2);
    const s = scenario({ hands: [[card, ...fillers()], fillers()], top: num('RED', 5) });
    expect(canPlayCard(card, s)).toBe(true);
  });

  it('match by number across colors and change the current color', () => {
    const card = num('GREEN', 5);
    const s = scenario({ hands: [[card, ...fillers()], fillers(), fillers()], top: num('RED', 5) });
    const next = ok(playCard(s, 'p0', card.id));
    expect(next.currentColor).toBe('GREEN');
    expect(next.discardPile.at(-1)).toEqual(card);
    expect(next.players[0].hand).toHaveLength(3);
    expect(next.players[0].cardsRemaining).toBe(3);
  });

  it('do not match a different number and color', () => {
    const s = scenario({ hands: [[num('GREEN', 4)], fillers()], top: num('RED', 5) });
    expect(canPlayCard(s.players[0].hand[0], s)).toBe(false);
  });

  it('action cards match by symbol', () => {
    const card = skip('GREEN');
    const s = scenario({ hands: [[card], fillers()], top: skip('RED') });
    expect(canPlayCard(card, s)).toBe(true);
    expect(canPlayCard(skip('YELLOW'), scenario({ hands: [[], []], top: num('RED', 1) }))).toBe(false);
  });

  it('uses the chosen color after a wild, not the wild itself', () => {
    const s = scenario({ hands: [[num('BLUE', 8)], fillers()], top: wild(), color: 'BLUE' });
    expect(canPlayCard(s.players[0].hand[0], s)).toBe(true);
    expect(canPlayCard(num('RED', 8), s)).toBe(false);
  });
});

describe('Wild', () => {
  it('can always be played', () => {
    const card = wild();
    const s = scenario({ hands: [[card, ...fillers()], fillers()], top: num('RED', 5) });
    expect(canPlayCard(card, s)).toBe(true);
  });

  it('sets the chosen color in one action', () => {
    const card = wild();
    const s = scenario({ hands: [[card, ...fillers()], fillers(), fillers()], top: num('RED', 5) });
    const next = ok(playCard(s, 'p0', card.id, 'YELLOW'));
    expect(next.currentColor).toBe('YELLOW');
    expect(next.discardPile.at(-1)).toEqual(card);
    expect(currentId(next)).toBe('p1');
  });

  it('waits for CHOOSE_COLOR when no color is given', () => {
    const card = wild();
    const s = scenario({ hands: [[card, ...fillers()], fillers(), fillers()], top: num('RED', 5) });
    const waiting = ok(playCard(s, 'p0', card.id));
    expect(waiting.pendingAction).toMatchObject({ type: 'CHOOSE_COLOR', playerId: 'p0' });
    expect(waiting.discardPile.at(-1)).toEqual(card);
    expect(currentId(waiting)).toBe('p0');

    expect(drawCards(waiting, 'p0').ok).toBe(false);
    expect(chooseColor(waiting, 'p1', 'BLUE').ok).toBe(false);

    const next = ok(chooseColor(waiting, 'p0', 'GREEN'));
    expect(next.currentColor).toBe('GREEN');
    expect(next.pendingAction).toBeNull();
    expect(currentId(next)).toBe('p1');
    expect(next.log.some((e) => e.type === 'COLOR_CHANGED' && e.color === 'GREEN')).toBe(true);
  });
});

describe('Wild Draw Four', () => {
  it('next player draws 4 and loses the turn; color changes', () => {
    const card = wildFour();
    const s = scenario({ hands: [[card, ...fillers()], fillers(), fillers()], top: num('RED', 5), color: 'RED' });
    const next = ok(playCard(s, 'p0', card.id, 'BLUE'));
    expect(next.players[1].hand).toHaveLength(7);
    expect(next.currentColor).toBe('BLUE');
    expect(currentId(next)).toBe('p2');
  });

  it('applies the penalty after the color is chosen in a separate step', () => {
    const card = wildFour();
    const s = scenario({ hands: [[card, ...fillers()], fillers(), fillers()], top: num('RED', 5) });
    const waiting = ok(playCard(s, 'p0', card.id));
    expect(waiting.players[1].hand).toHaveLength(3);
    const next = ok(chooseColor(waiting, 'p0', 'YELLOW'));
    expect(next.players[1].hand).toHaveLength(7);
    expect(currentId(next)).toBe('p2');
  });

  it('is illegal while holding a card of the current color (official rule)', () => {
    const card = wildFour();
    const s = scenario({ hands: [[card, num('RED', 1)], fillers()], top: num('RED', 5), color: 'RED' });
    expect(canPlayCard(card, s)).toBe(false);
    expect(playCard(s, 'p0', card.id, 'BLUE').ok).toBe(false);
  });

  it('is legal when holding only a matching number of another color', () => {
    const card = wildFour();
    const s = scenario({ hands: [[card, num('BLUE', 5)], fillers()], top: num('RED', 5), color: 'RED' });
    expect(canPlayCard(card, s)).toBe(true);
  });

  it('the restriction can be turned off', () => {
    const card = wildFour();
    const s = scenario({
      hands: [[card, num('RED', 1)], fillers()],
      top: num('RED', 5),
      settings: { strictWildDrawFour: false },
    });
    expect(canPlayCard(card, s)).toBe(true);
  });
});

describe('Draw Two', () => {
  it('next player draws 2 and loses the turn', () => {
    const card = drawTwo('RED');
    const s = scenario({ hands: [[card, ...fillers()], fillers(), fillers()], top: num('RED', 5) });
    const next = ok(playCard(s, 'p0', card.id));
    expect(next.players[1].hand).toHaveLength(5);
    expect(currentId(next)).toBe('p2');
    expect(next.pendingDraw).toBe(0);
    expect(next.log.some((e) => e.type === 'DRAW_PENALTY' && e.playerId === 'p1' && e.amount === 2)).toBe(true);
  });

  it('cannot be stacked with official rules', () => {
    const card = drawTwo('RED');
    const answer = drawTwo('BLUE');
    let s = scenario({ hands: [[card, ...fillers()], [answer, ...fillers()], fillers()], top: num('RED', 5) });
    s = ok(playCard(s, 'p0', card.id));
    expect(currentId(s)).toBe('p2');
  });

  it('stacking (house rule) passes the growing penalty on', () => {
    const settings = { stacking: true };
    let s = scenario({
      hands: [[drawTwo('RED'), ...fillers()], [drawTwo('BLUE'), ...fillers()], [num('GREEN', 1), ...fillers()]],
      top: num('RED', 5),
      settings,
    });
    s = ok(playCard(s, 'p0', s.players[0].hand[0].id));
    expect(s.pendingDraw).toBe(2);
    expect(currentId(s)).toBe('p1');
    s = ok(playCard(s, 'p1', s.players[1].hand[0].id));
    expect(s.pendingDraw).toBe(4);
    expect(currentId(s)).toBe('p2');
    // p2 has no +2: a normal card is not allowed, drawing takes the whole stack and ends the turn.
    expect(playCard(s, 'p2', s.players[2].hand[0].id).ok).toBe(false);
    s = ok(drawCards(s, 'p2'));
    expect(s.players[2].hand).toHaveLength(8);
    expect(s.pendingDraw).toBe(0);
    expect(currentId(s)).toBe('p0');
  });
});
