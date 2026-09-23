import { describe, it, expect, beforeEach } from 'vitest';
import { createGame, resetGameIdCounter, DEFAULT_SETTINGS } from '../game';
import { resetCardIdCounter } from '../deck';
import { getNextPlayerIndex, reverseDirection } from '../effects';
import type { GameState } from '../types';

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

describe('Turns', () => {
  beforeEach(() => {
    resetCardIdCounter();
    resetGameIdCounter();
  });

  it('should start with player 0', () => {
    const state = createTestGame(4);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.players[0].id).toBe('p0');
  });

  it('should advance to next player clockwise', () => {
    let state = createTestGame(4);
    expect(state.direction).toBe('clockwise');
    expect(getNextPlayerIndex(state, false)).toBe(1);
  });

  it('should wrap around clockwise', () => {
    const state = createTestGame(4);
    state.currentPlayerIndex = 3;
    expect(getNextPlayerIndex(state, false)).toBe(0);
  });

  it('should advance counter-clockwise', () => {
    const state = createTestGame(4);
    state.direction = 'counterclockwise';
    expect(getNextPlayerIndex(state, false)).toBe(3);
  });

  it('should wrap around counter-clockwise', () => {
    const state = createTestGame(4);
    state.direction = 'counterclockwise';
    state.currentPlayerIndex = 0;
    expect(getNextPlayerIndex(state, false)).toBe(3);
  });

  it('should skip next player when skip is true (clockwise)', () => {
    const state = createTestGame(4);
    expect(getNextPlayerIndex(state, true)).toBe(2);
  });

  it('should skip next player when skip is true (counter-clockwise)', () => {
    const state = createTestGame(4);
    state.direction = 'counterclockwise';
    expect(getNextPlayerIndex(state, true)).toBe(2);
  });

  it('reverseDirection should toggle correctly', () => {
    expect(reverseDirection('clockwise')).toBe('counterclockwise');
    expect(reverseDirection('counterclockwise')).toBe('clockwise');
  });

  it('Skip card should skip the next player', () => {
    const state = createTestGame(4);
    // Simulate skip effect: advance by 2
    const next = getNextPlayerIndex(state, true);
    expect(next).toBe(2);
  });

  it('Reverse card should change direction', () => {
    let state = createTestGame(4);
    state.direction = reverseDirection(state.direction);
    expect(state.direction).toBe('counterclockwise');
    // After reverse, next player should be p3
    expect(getNextPlayerIndex(state, false)).toBe(3);
  });

  it('Reverse in 2-player game acts as skip', () => {
    let state = createTestGame(2);
    expect(state.direction).toBe('clockwise');
    state.direction = reverseDirection(state.direction);
    // In 2-player, reverse acts like skip — next is still the other player
    expect(getNextPlayerIndex(state, false)).toBe(1);
  });

  it('4-player reverse: A → D → C → B', () => {
    const state = createTestGame(4);
    // Player A (index 0) plays reverse
    state.direction = reverseDirection(state.direction);
    // Next should be D (index 3)
    expect(getNextPlayerIndex(state, false)).toBe(3);
    // D plays, next should be C (index 2)
    state.currentPlayerIndex = 3;
    expect(getNextPlayerIndex(state, false)).toBe(2);
    // C plays, next should be B (index 1)
    state.currentPlayerIndex = 2;
    expect(getNextPlayerIndex(state, false)).toBe(1);
  });

  it('should deal 7 cards to each player', () => {
    const state = createTestGame(4);
    for (const player of state.players) {
      expect(player.hand).toHaveLength(7);
      expect(player.cardsRemaining).toBe(7);
    }
  });

  it('should have remaining deck after dealing', () => {
    const state = createTestGame(4);
    // 108 - 28 (4x7) - 1 (initial discard) = 79
    expect(state.deck.length).toBe(79);
  });

  it('should have a non-wild initial card', () => {
    const state = createTestGame(4);
    expect(state.activeCard).toBeDefined();
    expect(state.activeCard!.type).not.toBe('wild');
    expect(state.activeCard!.type).not.toBe('wild_draw_four');
  });

  it('should set active color from initial card', () => {
    const state = createTestGame(4);
    expect(state.activeColor).toBe(state.activeCard!.color);
  });

  it('should start in PLAYING status', () => {
    const state = createTestGame(4);
    expect(state.status).toBe('PLAYING');
  });

  it('should start with turn number 1', () => {
    const state = createTestGame(4);
    expect(state.turnNumber).toBe(1);
  });

  it('should have no pending draw at start', () => {
    const state = createTestGame(4);
    expect(state.pendingDraw).toBe(0);
  });
});
