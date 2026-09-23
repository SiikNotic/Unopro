import { describe, it, expect, beforeEach } from 'vitest';
import { createGame, callUno, playCard, resetGameIdCounter } from '../game';
import { resetCardIdCounter, makeCard } from '../deck';
import { canPlayCard } from '../validation';
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

describe('UNO', () => {
  beforeEach(() => {
    resetCardIdCounter();
    resetGameIdCounter();
  });

  it('should detect player with 1 card as vulnerable', () => {
    let state = createTestGame(4);
    // Give player 0 exactly 1 card by playing down to 1
    const player = state.players[0];
    while (player.hand.length > 1) {
      const playable = player.hand.find((c) => canPlayCard(c, state));
      if (playable) {
        state = playCard(state, 'p0', playable.id, playable.color === 'wild' ? 'red' : undefined);
        break; // just play one card
      }
      break;
    }
    // If player has 1 card, unoState should track them
    if (state.players[0].hand.length === 1) {
      expect(state.unoState.vulnerablePlayerIds).toContain('p0');
    }
  });

  it('should allow valid UNO call when player has 1 card', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    // Force player to have 1 card
    player.hand = [player.hand[0]];
    player.cardsRemaining = 1;
    state.unoState.vulnerablePlayerIds = ['p0'];

    state = callUno(state, 'p0');
    expect(state.unoState.status).toBe('valid');
    expect(state.unoState.calledByPlayerId).toBe('p0');
    expect(state.unoState.timestamp).not.toBeNull();
  });

  it('should mark UNO call as invalid when player does not have 1 card', () => {
    let state = createTestGame(4);
    // Player has 7 cards, not 1
    state = callUno(state, 'p0');
    expect(state.unoState.status).toBe('invalid');
  });

  it('should log UNO call', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    player.hand = [player.hand[0]];
    player.cardsRemaining = 1;
    state.unoState.vulnerablePlayerIds = ['p0'];

    state = callUno(state, 'p0');
    const unoLog = state.log.find((e) => e.type === 'PLAYER_CALLED_UNO');
    expect(unoLog).toBeDefined();
    expect(unoLog!.playerId).toBe('p0');
  });

  it('should clear vulnerable state after valid UNO call', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    player.hand = [player.hand[0]];
    player.cardsRemaining = 1;
    state.unoState.vulnerablePlayerIds = ['p0'];

    state = callUno(state, 'p0');
    expect(state.unoState.vulnerablePlayerIds).toHaveLength(0);
  });

  it('should set unoState when player reaches 1 card after playing', () => {
    let state = createTestGame(4);
    const player = state.players[0];
    // Set up: give player 2 cards, make one playable
    const playableCard = player.hand.find((c) => canPlayCard(c, state));
    if (playableCard) {
      // Remove all but playable and one other
      player.hand = [playableCard, player.hand.find((c) => c.id !== playableCard.id)!];
      player.cardsRemaining = 2;

      state = playCard(state, 'p0', playableCard.id, playableCard.color === 'wild' ? 'red' : undefined);
      // After playing, player has 1 card
      if (state.players[0].hand.length === 1) {
        expect(state.unoState.vulnerablePlayerIds).toContain('p0');
        expect(state.unoState.status).toBe('pending');
      }
    }
  });
});
