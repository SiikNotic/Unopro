import { describe, expect, it } from 'vitest';
import {
  DECK_SIZE,
  createDeck,
  drawCard,
  drawCards,
  getCardScore,
  getHandScore,
  recycleDiscardPile,
  resetDeck,
  shuffleDeck,
} from '../deck';
import { createRng } from '../rng';
import { COLORS } from '../types';
import { num, skip, wild, wildFour, drawTwo } from './helpers';

describe('Deck creation', () => {
  const deck = createDeck();

  it('has 108 cards with unique ids', () => {
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });

  it('has the standard composition per color', () => {
    for (const color of COLORS) {
      const cards = deck.filter((c) => c.color === color);
      expect(cards).toHaveLength(25);
      expect(cards.filter((c) => c.type === 'NUMBER' && c.value === 0)).toHaveLength(1);
      for (let n = 1; n <= 9; n++) {
        expect(cards.filter((c) => c.type === 'NUMBER' && c.value === n)).toHaveLength(2);
      }
      for (const type of ['SKIP', 'REVERSE', 'DRAW_TWO']) {
        expect(cards.filter((c) => c.type === type)).toHaveLength(2);
      }
    }
  });

  it('has 4 Wild and 4 Wild Draw Four with no color', () => {
    expect(deck.filter((c) => c.type === 'WILD' && c.color === 'WILD')).toHaveLength(4);
    expect(deck.filter((c) => c.type === 'WILD_DRAW_FOUR' && c.color === 'WILD')).toHaveLength(4);
  });

  it('uses values 0-9 for numbers and null for everything else', () => {
    for (const card of deck) {
      if (card.type === 'NUMBER') expect(card.value).toBeGreaterThanOrEqual(0);
      else expect(card.value).toBeNull();
    }
  });
});

describe('Shuffling', () => {
  it('keeps the same cards and does not mutate the input', () => {
    const deck = createDeck();
    const copy = [...deck];
    const shuffled = shuffleDeck(deck, createRng(42));
    expect(deck).toEqual(copy);
    expect(shuffled.map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
    expect(shuffled.map((c) => c.id)).not.toEqual(deck.map((c) => c.id));
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = shuffleDeck(createDeck(), createRng(7)).map((c) => c.id);
    const b = shuffleDeck(createDeck(), createRng(7)).map((c) => c.id);
    const c = shuffleDeck(createDeck(), createRng(8)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('resetDeck returns a full shuffled deck', () => {
    const deck = resetDeck(createRng(3));
    expect(deck).toHaveLength(108);
    expect(deck.map((c) => c.id)).not.toEqual(createDeck().map((c) => c.id));
  });
});

describe('Drawing', () => {
  it('draws from the top of the pile', () => {
    const cards = [num('RED', 1), num('RED', 2), num('RED', 3)];
    const r = drawCard({ deck: cards, discardPile: [] }, createRng(1));
    expect(r.cards).toEqual([cards[0]]);
    expect(r.deck).toEqual([cards[1], cards[2]]);
  });

  it('draws several cards', () => {
    const cards = [num('RED', 1), num('RED', 2), num('RED', 3)];
    const r = drawCards({ deck: cards, discardPile: [] }, 2, createRng(1));
    expect(r.cards).toEqual([cards[0], cards[1]]);
    expect(r.deck).toHaveLength(1);
    expect(r.recycled).toBe(0);
  });
});

describe('Recycling the discard pile', () => {
  it('keeps the top card and shuffles the rest into the draw pile', () => {
    const discard = [num('RED', 1), skip('BLUE'), wild(), num('GREEN', 4)];
    const r = recycleDiscardPile({ deck: [], discardPile: discard }, createRng(5));
    expect(r.discardPile).toEqual([discard[3]]);
    expect(r.deck.map((c) => c.id).sort()).toEqual(discard.slice(0, 3).map((c) => c.id).sort());
  });

  it('recycles automatically when drawing from an empty pile', () => {
    const top = num('YELLOW', 9);
    const discard = [num('RED', 1), num('RED', 2), num('RED', 3), top];
    const r = drawCards({ deck: [num('BLUE', 5)], discardPile: discard }, 3, createRng(9));
    expect(r.cards).toHaveLength(3);
    expect(r.recycled).toBe(1);
    expect(r.discardPile).toEqual([top]);
    expect(r.deck).toHaveLength(1);
  });

  it('returns fewer cards instead of failing when nothing is left', () => {
    const top = num('YELLOW', 9);
    const r = drawCards({ deck: [num('BLUE', 5)], discardPile: [top] }, 4, createRng(9));
    expect(r.cards).toHaveLength(1);
    expect(r.deck).toEqual([]);
    expect(r.discardPile).toEqual([top]);
  });
});

describe('Card scores', () => {
  it('uses official values', () => {
    expect(getCardScore(num('RED', 7))).toBe(7);
    expect(getCardScore(num('RED', 0))).toBe(0);
    expect(getCardScore(skip('RED'))).toBe(20);
    expect(getCardScore(drawTwo('RED'))).toBe(20);
    expect(getCardScore(wild())).toBe(50);
    expect(getCardScore(wildFour())).toBe(50);
    expect(getHandScore([num('RED', 7), skip('BLUE'), wild()])).toBe(77);
  });
});
