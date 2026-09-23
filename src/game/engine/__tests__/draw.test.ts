import { describe, expect, it } from 'vitest';
import { drawCards, endTurn, playCard } from '../game';
import { currentId, num, ok, scenario, skip } from './helpers';

const fillers = () => [num('BLUE', 1), num('BLUE', 2), num('BLUE', 3)];

describe('Drawing on your turn', () => {
  it('draws one card; an unplayable card ends the turn', () => {
    const drawn = num('GREEN', 9);
    const s = scenario({ hands: [fillers(), fillers(), fillers()], top: num('RED', 5), deck: [drawn, num('RED', 1)] });
    const next = ok(drawCards(s, 'p0'));
    expect(next.players[0].hand).toContainEqual(drawn);
    expect(next.players[0].cardsRemaining).toBe(4);
    expect(next.deck).toHaveLength(1);
    expect(currentId(next)).toBe('p1');
    expect(next.log.map((e) => e.type)).toEqual(['PLAYER_DREW_CARD', 'PLAYER_PASSED']);
  });

  it('a playable drawn card may be played immediately', () => {
    const drawn = num('RED', 9);
    const s = scenario({ hands: [fillers(), fillers(), fillers()], top: num('RED', 5), deck: [drawn] });
    const waiting = ok(drawCards(s, 'p0'));
    expect(currentId(waiting)).toBe('p0');
    expect(waiting.pendingAction).toEqual({ type: 'PLAY_DRAWN_CARD', playerId: 'p0', cardId: drawn.id });
    expect(drawCards(waiting, 'p0').ok).toBe(false);
    const played = ok(playCard(waiting, 'p0', drawn.id));
    expect(played.discardPile.at(-1)).toEqual(drawn);
    expect(currentId(played)).toBe('p1');
  });

  it('only the drawn card may be played after drawing', () => {
    const drawn = num('RED', 9);
    const other = num('RED', 1);
    const s = scenario({ hands: [[other, ...fillers()], fillers()], top: num('RED', 5), deck: [drawn] });
    const waiting = ok(drawCards(s, 'p0'));
    expect(playCard(waiting, 'p0', other.id).ok).toBe(false);
  });

  it('or the player can keep it and end the turn', () => {
    const drawn = num('RED', 9);
    const s = scenario({ hands: [fillers(), fillers()], top: num('RED', 5), deck: [drawn] });
    const next = ok(endTurn(ok(drawCards(s, 'p0')), 'p0'));
    expect(next.players[0].hand).toContainEqual(drawn);
    expect(currentId(next)).toBe('p1');
    expect(next.pendingAction).toBeNull();
  });

  it('drawUntilPlayable keeps drawing until a playable card appears', () => {
    const deck = [num('GREEN', 1), num('YELLOW', 2), num('RED', 7), num('GREEN', 3)];
    const s = scenario({ hands: [fillers(), fillers()], top: num('RED', 5), deck, settings: { drawUntilPlayable: true } });
    const next = ok(drawCards(s, 'p0'));
    expect(next.players[0].hand).toHaveLength(6);
    expect(next.pendingAction).toMatchObject({ type: 'PLAY_DRAWN_CARD', cardId: deck[2].id });
  });

  it('forcePlay forbids drawing while holding a playable card and passing with a playable drawn card', () => {
    const settings = { forcePlay: true };
    const s = scenario({ hands: [[num('RED', 1), ...fillers()], fillers()], top: num('RED', 5), settings });
    expect(drawCards(s, 'p0').ok).toBe(false);

    const drawn = num('RED', 9);
    const s2 = scenario({ hands: [fillers(), fillers()], top: num('RED', 5), deck: [drawn], settings });
    const waiting = ok(drawCards(s2, 'p0'));
    expect(endTurn(waiting, 'p0').ok).toBe(false);
  });

  it('with official rules a player may draw even when holding a playable card', () => {
    const s = scenario({ hands: [[num('RED', 1), ...fillers()], fillers()], top: num('RED', 5), deck: [num('GREEN', 2)] });
    expect(drawCards(s, 'p0').ok).toBe(true);
  });
});

describe('Deck recycling during play', () => {
  it('reshuffles the discard pile (keeping the top card) when the draw pile is empty', () => {
    const top = num('RED', 5);
    const below = [num('GREEN', 1), num('YELLOW', 2), skip('BLUE')];
    const s = scenario({ hands: [fillers(), fillers()], top, discardBelow: below, deck: [] });
    const next = ok(drawCards(s, 'p0'));
    expect(next.discardPile).toEqual([top]);
    expect(next.deck.length + 1).toBe(below.length);
    expect(next.players[0].hand).toHaveLength(4);
    expect(next.log.some((e) => e.type === 'DECK_RECYCLED')).toBe(true);
  });

  it('keeps the game going when there is nothing left to draw at all', () => {
    const s = scenario({ hands: [fillers(), fillers()], top: num('RED', 5), deck: [] });
    const next = ok(drawCards(s, 'p0'));
    expect(next.players[0].hand).toHaveLength(3);
    expect(next.status).toBe('PLAYING');
    expect(currentId(next)).toBe('p1');
    expect(next.log.some((e) => e.type === 'DECK_EXHAUSTED')).toBe(true);
  });

  it('recycles in the middle of a draw penalty', () => {
    const top = num('RED', 5);
    const below = [num('GREEN', 1), num('YELLOW', 2), num('BLUE', 7)];
    const plus2 = { id: 'RED-DRAW_TWO-x', color: 'RED' as const, type: 'DRAW_TWO' as const, value: null };
    const s = scenario({ hands: [[plus2, ...fillers()], fillers(), fillers()], top, discardBelow: below, deck: [num('RED', 3)] });
    const next = ok(playCard(s, 'p0', plus2.id));
    expect(next.players[1].hand).toHaveLength(5);
    expect(next.discardPile.at(-1)).toEqual(plus2);
  });
});
