import type { Card, CardColor, CardDeck, CardType, CardValue } from './types';

let cardIdCounter = 0;

function nextCardId(): string {
  cardIdCounter += 1;
  return `c${cardIdCounter}`;
}

const COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];

export function createDeck(): CardDeck {
  const deck: CardDeck = [];

  for (const color of COLORS) {
    // One 0 per color
    deck.push({ id: nextCardId(), color, type: 'number', value: 0 });

    // Two of each 1-9 per color
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: nextCardId(), color, type: 'number', value: n });
      deck.push({ id: nextCardId(), color, type: 'number', value: n });
    }

    // Two Skip per color
    deck.push({ id: nextCardId(), color, type: 'skip', value: 'skip' });
    deck.push({ id: nextCardId(), color, type: 'skip', value: 'skip' });

    // Two Reverse per color
    deck.push({ id: nextCardId(), color, type: 'reverse', value: 'reverse' });
    deck.push({ id: nextCardId(), color, type: 'reverse', value: 'reverse' });

    // Two Draw Two per color
    deck.push({ id: nextCardId(), color, type: 'draw_two', value: 'draw_two' });
    deck.push({ id: nextCardId(), color, type: 'draw_two', value: 'draw_two' });
  }

  // Four Wild
  for (let i = 0; i < 4; i++) {
    deck.push({ id: nextCardId(), color: 'wild', type: 'wild', value: 'wild' });
  }

  // Four Wild Draw Four
  for (let i = 0; i < 4; i++) {
    deck.push({ id: nextCardId(), color: 'wild', type: 'wild_draw_four', value: 'wild_draw_four' });
  }

  return deck;
}

export function shuffleDeck(deck: CardDeck): CardDeck {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function drawFromDeck(deck: CardDeck, count: number): { drawn: CardDeck; remaining: CardDeck } {
  return {
    drawn: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

export function recycleDiscardPile(discardPile: CardDeck): { newDeck: CardDeck; topCard: Card } {
  if (discardPile.length === 0) {
    throw new Error('Cannot recycle an empty discard pile');
  }
  const topCard = discardPile[discardPile.length - 1];
  const rest = discardPile.slice(0, -1);
  return {
    newDeck: shuffleDeck(rest),
    topCard,
  };
}

export function getCardScore(card: Card): number {
  if (card.type === 'number') return card.value as number;
  if (card.type === 'wild' || card.type === 'wild_draw_four') return 50;
  return 20; // skip, reverse, draw_two
}

export function getHandScore(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + getCardScore(card), 0);
}

export function makeCard(color: CardColor, type: CardType, value: CardValue): Card {
  return { id: nextCardId(), color, type, value };
}

export function resetCardIdCounter(): void {
  cardIdCounter = 0;
}
