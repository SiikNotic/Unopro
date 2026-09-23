import { describe, it, expect, beforeEach } from 'vitest';
import { createGame, playCard, drawCards, resetGameIdCounter } from '../game';
import { resetCardIdCounter, makeCard } from '../deck';
import { canPlayCard } from '../validation';
import type { Card, GameState } from '../types';

function createTestGame(numPlayers = 4): GameState {
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: `p${i}`,
      name: `Player ${i}`,
      type: i === 0 ? 'human' as const : 'bot' as const,
    });
  }
  return createGame({ players, startingCards: 7 });
}

function findPlayableCard(state: GameState, playerId: string): Card | undefined {
  const player = state.players.find((p) => p.id === playerId)!;
  return player.hand.find((c) => canPlayCard(c, state));
}

function forcePlayableCard(state: GameState, playerId: string, color: string, type: string): Card {
  const player = state.players.find((p) => p.id === playerId)!;
  const card = player.hand.find((c) => c.color === color && c.type === type);
  if (card) return card;
  // If no matching card, make one by modifying a card in hand
  const anyCard = player.hand[0];
  anyCard.color = color as Card['color'];
  anyCard.type = type as Card['type'];
  anyCard.value = type === 'number' ? 5 : type;
  return anyCard;
}

describe('Card Validation', () => {
  beforeEach(() => {
    resetCardIdCounter();
    resetGameIdCounter();
  });

  it('should allow playing a card matching the active color', () => {
    const state = createTestGame();
    const activeColor = state.activeColor!;
    const player = state.players[0];
    const matchingCard = player.hand.find((c) => c.color === activeColor);
    if (matchingCard) {
      expect(canPlayCard(matchingCard, state)).toBe(true);
    }
  });

  it('should not allow playing a card that does not match color or type', () => {
    const state = createTestGame();
    const activeColor = state.activeColor!;
    const activeCard = state.activeCard!;
    const player = state.players[0];
    const nonMatching = player.hand.find(
      (c) => c.color !== activeColor && c.type !== activeCard.type
    );
    if (nonMatching) {
      expect(canPlayCard(nonMatching, state)).toBe(false);
    }
  });

  it('should allow playing a number card matching the active number', () => {
    const state = createTestGame();
    const activeCard = state.activeCard!;
    if (activeCard.type === 'number') {
      const player = state.players[0];
      const matchingNumber = player.hand.find(
        (c) => c.type === 'number' && c.value === activeCard.value
      );
      if (matchingNumber) {
        expect(canPlayCard(matchingNumber, state)).toBe(true);
      }
    }
  });

  it('should allow playing a Wild card anytime', () => {
    const state = createTestGame();
    const wildCard = makeCard('wild', 'wild', 'wild');
    expect(canPlayCard(wildCard, state)).toBe(true);
  });

  it('should allow playing a Wild Draw Four card', () => {
    const state = createTestGame();
    const wildDrawFour = makeCard('wild', 'wild_draw_four', 'wild_draw_four');
    expect(canPlayCard(wildDrawFour, state)).toBe(true);
  });

  it('should allow matching by type (Skip on Skip)', () => {
    const state = createTestGame();
    state.activeCard = makeCard('red', 'skip', 'skip');
    state.activeColor = 'red';
    const blueSkip = makeCard('blue', 'skip', 'skip');
    expect(canPlayCard(blueSkip, state)).toBe(true);
  });

  it('should allow matching by type (Reverse on Reverse)', () => {
    const state = createTestGame();
    state.activeCard = makeCard('red', 'reverse', 'reverse');
    state.activeColor = 'red';
    const greenReverse = makeCard('green', 'reverse', 'reverse');
    expect(canPlayCard(greenReverse, state)).toBe(true);
  });

  it('should allow matching by type (Draw Two on Draw Two)', () => {
    const state = createTestGame();
    state.activeCard = makeCard('red', 'draw_two', 'draw_two');
    state.activeColor = 'red';
    const blueDrawTwo = makeCard('blue', 'draw_two', 'draw_two');
    expect(canPlayCard(blueDrawTwo, state)).toBe(true);
  });

  it('should not allow playing out of turn', () => {
    const state = createTestGame();
    const player1Card = state.players[1].hand[0];
    const result = playCard(state, 'p1', player1Card.id);
    expect(result.log.some((e) => e.type === 'ERROR')).toBe(true);
  });

  it('should not allow playing a card not in hand', () => {
    const state = createTestGame();
    const fakeCard = makeCard('red', 'number', 5);
    const result = playCard(state, 'p0', fakeCard.id);
    expect(result.log.some((e) => e.type === 'ERROR')).toBe(true);
  });

  it('should remove card from hand after playing', () => {
    let state = createTestGame();
    const player = state.players[0];
    const initialHandSize = player.hand.length;
    const playable = findPlayableCard(state, 'p0');
    if (playable) {
      state = playCard(state, 'p0', playable.id, playable.color === 'wild' ? 'red' : undefined);
      expect(state.players[0].hand).toHaveLength(initialHandSize - 1);
    }
  });

  it('should place played card on discard pile', () => {
    let state = createTestGame();
    const playable = findPlayableCard(state, 'p0');
    if (playable) {
      const initialDiscardSize = state.discardPile.length;
      state = playCard(state, 'p0', playable.id, playable.color === 'wild' ? 'red' : undefined);
      expect(state.discardPile.length).toBe(initialDiscardSize + 1);
      expect(state.discardPile[state.discardPile.length - 1].id).toBe(playable.id);
    }
  });
});

describe('Special Cards', () => {
  beforeEach(() => {
    resetCardIdCounter();
    resetGameIdCounter();
  });

  it('Skip should skip the next player', () => {
    let state = createTestGame(4);
    // Force a skip card into player 0's hand and make it playable
    const player = state.players[0];
    const skipCard = player.hand.find((c) => c.type === 'skip') ?? makeCard(state.activeColor!, 'skip', 'skip');
    skipCard.color = state.activeColor!;
    skipCard.type = 'skip';
    skipCard.value = 'skip';

    state = playCard(state, 'p0', skipCard.id);
    // After skip, should jump from 0 to 2
    expect(state.currentPlayerIndex).toBe(2);
  });

  it('Reverse should change direction', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    const reverseCard = player.hand.find((c) => c.type === 'reverse') ?? makeCard(state.activeColor!, 'reverse', 'reverse');
    reverseCard.color = state.activeColor!;
    reverseCard.type = 'reverse';
    reverseCard.value = 'reverse';

    state = playCard(state, 'p0', reverseCard.id);
    expect(state.direction).toBe('counterclockwise');
    // Next player should be 3 (counter-clockwise from 0)
    expect(state.currentPlayerIndex).toBe(3);
  });

  it('Draw Two should add 2 to pendingDraw and skip next player', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    const drawTwoCard = player.hand.find((c) => c.type === 'draw_two') ?? makeCard(state.activeColor!, 'draw_two', 'draw_two');
    drawTwoCard.color = state.activeColor!;
    drawTwoCard.type = 'draw_two';
    drawTwoCard.value = 'draw_two';

    state = playCard(state, 'p0', drawTwoCard.id);
    expect(state.pendingDraw).toBe(2);
    expect(state.pendingSkip).toBe(true);
    // Turn should advance to player 2 (skipping player 1)
    expect(state.currentPlayerIndex).toBe(2);
  });

  it('Wild should require color choice and change status', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    const wildCard = player.hand.find((c) => c.type === 'wild') ?? makeCard('wild', 'wild', 'wild');
    if (!player.hand.includes(wildCard)) {
      player.hand[0] = wildCard;
    }

    state = playCard(state, 'p0', wildCard.id);
    expect(state.status).toBe('CHOOSING_COLOR');
  });

  it('Wild Draw Four should require color choice and set pendingDraw to 4', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    const wdfCard = makeCard('wild', 'wild_draw_four', 'wild_draw_four');
    player.hand[0] = wdfCard;

    state = playCard(state, 'p0', wdfCard.id);
    expect(state.status).toBe('CHOOSING_COLOR');
  });

  it('chooseColor should set active color and resume play', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    const wildCard = makeCard('wild', 'wild', 'wild');
    player.hand[0] = wildCard;

    state = playCard(state, 'p0', wildCard.id);
    expect(state.status).toBe('CHOOSING_COLOR');

    const { chooseColor } = require('../game');
    state = chooseColor(state, 'p0', 'red');
    expect(state.activeColor).toBe('red');
    expect(state.status).toBe('PLAYING');
  });

  it('Wild Draw Four should set pendingDraw to 4 after color choice', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    const wdfCard = makeCard('wild', 'wild_draw_four', 'wild_draw_four');
    player.hand[0] = wdfCard;

    state = playCard(state, 'p0', wdfCard.id);
    const { chooseColor } = require('../game');
    state = chooseColor(state, 'p0', 'blue');
    expect(state.pendingDraw).toBe(4);
    expect(state.pendingSkip).toBe(true);
  });
});

describe('Draw', () => {
  beforeEach(() => {
    resetCardIdCounter();
    resetGameIdCounter();
  });

  it('should add drawn cards to player hand', () => {
    let state = createTestGame(4);
    const initialHandSize = state.players[0].hand.length;
    state = drawCards(state, 'p0', 1);
    expect(state.players[0].hand.length).toBe(initialHandSize + 1);
    expect(state.players[0].cardsRemaining).toBe(initialHandSize + 1);
  });

  it('should reduce deck size', () => {
    let state = createTestGame(4);
    const initialDeckSize = state.deck.length;
    state = drawCards(state, 'p0', 3);
    expect(state.deck.length).toBe(initialDeckSize - 3);
  });

  it('should not allow drawing out of turn', () => {
    const state = createTestGame(4);
    const result = drawCards(state, 'p1', 1);
    expect(result.log.some((e) => e.type === 'ERROR')).toBe(true);
  });

  it('should clear pendingDraw when drawing', () => {
    let state = createTestGame(4);
    state.pendingDraw = 2;
    state.pendingSkip = true;
    state = drawCards(state, 'p0', 1);
    expect(state.pendingDraw).toBe(0);
    // Should have drawn 2 (the pending amount), not 1
    expect(state.players[0].hand.length).toBeGreaterThanOrEqual(7 + 2);
  });

  it('should recycle discard pile when deck runs out', () => {
    let state = createTestGame(4);
    // Move all deck cards to discard except a few
    const allDeck = [...state.deck];
    state.discardPile = [...state.discardPile, ...allDeck.slice(0, allDeck.length - 2)];
    state.deck = allDeck.slice(allDeck.length - 2);

    const discardBeforeRecycle = state.discardPile.length;
    state = drawCards(state, 'p0', 5);

    // Should have recycled the discard pile
    expect(state.log.some((e) => e.type === 'DECK_RECYCLED')).toBe(true);
    // Should still have cards in deck after drawing
    expect(state.deck.length).toBeGreaterThan(0);
  });
});
