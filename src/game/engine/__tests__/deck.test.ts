import { describe, it, expect, beforeEach } from 'vitest';
import { createDeck, shuffleDeck, drawFromDeck, recycleDiscardPile, getCardScore, resetCardIdCounter } from '../deck';

describe('Deck', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  describe('createDeck', () => {
    it('should create a deck with 108 cards', () => {
      const deck = createDeck();
      expect(deck).toHaveLength(108);
    });

    it('should have 76 number cards (0-9 across 4 colors)', () => {
      const deck = createDeck();
      const numberCards = deck.filter((c) => c.type === 'number');
      expect(numberCards).toHaveLength(76);
    });

    it('should have one 0 per color (4 total)', () => {
      const deck = createDeck();
      const zeros = deck.filter((c) => c.type === 'number' && c.value === 0);
      expect(zeros).toHaveLength(4);
    });

    it('should have two of each 1-9 per color', () => {
      const deck = createDeck();
      for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
        for (let n = 1; n <= 9; n++) {
          const cards = deck.filter((c) => c.color === color && c.type === 'number' && c.value === n);
          expect(cards).toHaveLength(2);
        }
      }
    });

    it('should have 8 Skip cards (2 per color)', () => {
      const deck = createDeck();
      const skips = deck.filter((c) => c.type === 'skip');
      expect(skips).toHaveLength(8);
    });

    it('should have 8 Reverse cards (2 per color)', () => {
      const deck = createDeck();
      const reverses = deck.filter((c) => c.type === 'reverse');
      expect(reverses).toHaveLength(8);
    });

    it('should have 8 Draw Two cards (2 per color)', () => {
      const deck = createDeck();
      const drawTwos = deck.filter((c) => c.type === 'draw_two');
      expect(drawTwos).toHaveLength(8);
    });

    it('should have 4 Wild cards', () => {
      const deck = createDeck();
      const wilds = deck.filter((c) => c.type === 'wild');
      expect(wilds).toHaveLength(4);
    });

    it('should have 4 Wild Draw Four cards', () => {
      const deck = createDeck();
      const wildDrawFours = deck.filter((c) => c.type === 'wild_draw_four');
      expect(wildDrawFours).toHaveLength(4);
    });

    it('should have all unique card IDs', () => {
      const deck = createDeck();
      const ids = deck.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('shuffleDeck', () => {
    it('should return a deck of the same length', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled).toHaveLength(deck.length);
    });

    it('should not mutate the original deck', () => {
      const deck = createDeck();
      const original = [...deck];
      shuffleDeck(deck);
      expect(deck).toEqual(original);
    });

    it('should contain the same cards (same IDs)', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      const originalIds = new Set(deck.map((c) => c.id));
      const shuffledIds = new Set(shuffled.map((c) => c.id));
      expect(shuffledIds).toEqual(originalIds);
    });
  });

  describe('drawFromDeck', () => {
    it('should draw the requested number of cards', () => {
      const deck = createDeck();
      const { drawn, remaining } = drawFromDeck(deck, 7);
      expect(drawn).toHaveLength(7);
      expect(remaining).toHaveLength(108 - 7);
    });

    it('should draw from the top of the deck', () => {
      const deck = createDeck();
      const { drawn, remaining } = drawFromDeck(deck, 1);
      expect(drawn[0]).toEqual(deck[0]);
      expect(remaining[0]).toEqual(deck[1]);
    });

    it('should handle drawing 0 cards', () => {
      const deck = createDeck();
      const { drawn, remaining } = drawFromDeck(deck, 0);
      expect(drawn).toHaveLength(0);
      expect(remaining).toHaveLength(108);
    });
  });

  describe('recycleDiscardPile', () => {
    it('should keep the top card and shuffle the rest', () => {
      const deck = createDeck();
      const { drawn, remaining } = drawFromDeck(deck, 100);
      const discardPile = [...drawn];
      const topCard = discardPile[discardPile.length - 1];
      const rest = discardPile.slice(0, -1);

      const { newDeck, topCard: recycledTop } = recycleDiscardPile(discardPile);
      expect(recycledTop).toEqual(topCard);
      expect(newDeck).toHaveLength(rest.length);
    });

    it('should throw on empty discard pile', () => {
      expect(() => recycleDiscardPile([])).toThrow();
    });
  });

  describe('getCardScore', () => {
    it('should score number cards by face value', () => {
      expect(getCardScore({ id: 'x', color: 'red', type: 'number', value: 5 })).toBe(5);
      expect(getCardScore({ id: 'x', color: 'red', type: 'number', value: 0 })).toBe(0);
      expect(getCardScore({ id: 'x', color: 'red', type: 'number', value: 9 })).toBe(9);
    });

    it('should score action cards at 20', () => {
      expect(getCardScore({ id: 'x', color: 'red', type: 'skip', value: 'skip' })).toBe(20);
      expect(getCardScore({ id: 'x', color: 'red', type: 'reverse', value: 'reverse' })).toBe(20);
      expect(getCardScore({ id: 'x', color: 'red', type: 'draw_two', value: 'draw_two' })).toBe(20);
    });

    it('should score wild cards at 50', () => {
      expect(getCardScore({ id: 'x', color: 'wild', type: 'wild', value: 'wild' })).toBe(50);
      expect(getCardScore({ id: 'x', color: 'wild', type: 'wild_draw_four', value: 'wild_draw_four' })).toBe(50);
    });
  });
});
