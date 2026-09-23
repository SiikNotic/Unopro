import type { Card, CardColor, CardType, CardValue } from './types';
import { COLORS } from './types';
import type { Rng } from './rng';

export const DECK_SIZE = 108;

/** Standard 108-card deck. Ids are stable (e.g. "RED-5-1", "WILD_DRAW_FOUR-2") so games can be replayed. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  const add = (color: Card['color'], type: CardType, value: CardValue, copy: number) => {
    const symbol = type === 'NUMBER' ? String(value) : type;
    const id = color === 'WILD' ? `${type}-${copy}` : `${color}-${symbol}-${copy}`;
    deck.push({ id, color, type, value });
  };

  for (const color of COLORS) {
    add(color, 'NUMBER', 0, 0);
    for (let n = 1; n <= 9; n++) {
      add(color, 'NUMBER', n as CardValue, 0);
      add(color, 'NUMBER', n as CardValue, 1);
    }
    for (const type of ['SKIP', 'REVERSE', 'DRAW_TWO'] as const) {
      add(color, type, null, 0);
      add(color, type, null, 1);
    }
  }
  for (let i = 0; i < 4; i++) add('WILD', 'WILD', null, i);
  for (let i = 0; i < 4; i++) add('WILD', 'WILD_DRAW_FOUR', null, i);

  return deck;
}

/** Fisher-Yates shuffle. Returns a new array; the input is not modified. */
export function shuffleDeck(deck: Card[], rng: Rng): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A fresh, shuffled 108-card draw pile. */
export function resetDeck(rng: Rng): Card[] {
  return shuffleDeck(createDeck(), rng);
}

export interface Piles {
  deck: Card[];
  discardPile: Card[];
}

/**
 * Keeps the top discard card and shuffles the rest of the discard pile into a new draw pile.
 * Wild cards lose any chosen color automatically because color is stored in GameState, not on the card.
 */
export function recycleDiscardPile(piles: Piles, rng: Rng): Piles {
  if (piles.discardPile.length <= 1) return { deck: [...piles.deck], discardPile: [...piles.discardPile] };
  const top = piles.discardPile[piles.discardPile.length - 1];
  const rest = piles.discardPile.slice(0, -1);
  return { deck: [...piles.deck, ...shuffleDeck(rest, rng)], discardPile: [top] };
}

export interface DrawResult extends Piles {
  cards: Card[];
  recycled: number;
}

/**
 * Draws from the top (index 0) of the draw pile, recycling the discard pile when it runs out.
 * If there is genuinely nothing left to draw, returns fewer cards than requested instead of failing.
 */
export function drawCards(piles: Piles, count: number, rng: Rng): DrawResult {
  let deck = [...piles.deck];
  let discardPile = [...piles.discardPile];
  const cards: Card[] = [];
  let recycled = 0;

  while (cards.length < count) {
    if (deck.length === 0) {
      if (discardPile.length <= 1) break;
      ({ deck, discardPile } = recycleDiscardPile({ deck, discardPile }, rng));
      recycled++;
    }
    cards.push(deck.shift()!);
  }

  return { cards, deck, discardPile, recycled };
}

export function drawCard(piles: Piles, rng: Rng): DrawResult {
  return drawCards(piles, 1, rng);
}

export function isWild(card: Card): boolean {
  return card.type === 'WILD' || card.type === 'WILD_DRAW_FOUR';
}

/** Official scoring: face value for numbers, 20 for Skip/Reverse/Draw Two, 50 for wilds. */
export function getCardScore(card: Card): number {
  if (card.type === 'NUMBER') return card.value ?? 0;
  if (isWild(card)) return 50;
  return 20;
}

export function getHandScore(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + getCardScore(card), 0);
}

const TYPE_LABELS: Record<CardType, string> = {
  NUMBER: '',
  SKIP: 'Skip',
  REVERSE: 'Reverse',
  DRAW_TWO: '+2',
  WILD: 'Wild',
  WILD_DRAW_FOUR: 'Wild +4',
};

export function cardLabel(card: Card): string {
  if (card.type === 'NUMBER') return `${card.color} ${card.value}`;
  if (isWild(card)) return TYPE_LABELS[card.type];
  return `${card.color} ${TYPE_LABELS[card.type]}`;
}

/** Builds a card with an explicit id — handy for tests and fixtures. */
export function makeCard(id: string, color: CardColor | 'WILD', type: CardType, value: CardValue = null): Card {
  return { id, color, type, value };
}
