// Turn order and card effects. This file is the single source of truth for what
// every card does — UI, bots and (later) the network layer all go through here.
import type { Card, Direction, GameState } from './types';
import type { EngineContext } from './log';
import { addLog } from './log';
import { drawCards as drawFromPiles } from './deck';
import { calculateRoundScore } from './scoring';
import { syncUnoAfterHandChange } from './uno';

export function reverseDirection(direction: Direction): Direction {
  return direction === 'CLOCKWISE' ? 'COUNTER_CLOCKWISE' : 'CLOCKWISE';
}

/** Index of the player `steps` seats away from `fromIndex` in the current direction. */
export function getNextPlayerIndex(state: GameState, fromIndex = state.currentPlayerIndex, steps = 1): number {
  const n = state.players.length;
  const delta = state.direction === 'CLOCKWISE' ? steps : -steps;
  return (((fromIndex + delta) % n) + n) % n;
}

/** Moves the turn `steps` seats from `fromIndex` and starts a new turn. */
export function advanceTurn(state: GameState, fromIndex: number, steps = 1): void {
  state.currentPlayerIndex = getNextPlayerIndex(state, fromIndex, steps);
  state.pendingAction = null;
  state.turnNumber += 1;
}

/** Gives cards to a player, recycling the discard pile when the draw pile is empty. Returns the drawn cards. */
export function giveCards(state: GameState, ctx: EngineContext, playerIndex: number, count: number): Card[] {
  const player = state.players[playerIndex];
  const result = drawFromPiles(state, count, ctx.rng);
  state.deck = result.deck;
  state.discardPile = result.discardPile;
  for (let i = 0; i < result.recycled; i++) {
    addLog(state, ctx, 'DECK_RECYCLED', 'Draw pile empty: discard pile shuffled into a new draw pile');
  }
  if (result.cards.length < count) {
    addLog(state, ctx, 'DECK_EXHAUSTED', `Only ${result.cards.length} of ${count} cards could be drawn`, {
      playerId: player.id,
      amount: result.cards.length,
    });
  }
  player.hand.push(...result.cards);
  player.cardsRemaining = player.hand.length;
  if (result.cards.length > 0) syncUnoAfterHandChange(state, player, 'DREW');
  return result.cards;
}

/** Makes a player draw a penalty and lose their turn. */
function applyDrawPenalty(state: GameState, ctx: EngineContext, victimIndex: number, amount: number): void {
  const victim = state.players[victimIndex];
  const drawn = giveCards(state, ctx, victimIndex, amount);
  addLog(state, ctx, 'DRAW_PENALTY', `${victim.name} draws ${drawn.length} and loses the turn`, {
    playerId: victim.id,
    amount: drawn.length,
  });
}

/**
 * Applies the effect of a card that has just been placed on the discard pile (with its color already set)
 * by the player at `playerIndex`, then either ends the round or passes the turn.
 */
export function applyCardEffect(state: GameState, ctx: EngineContext, card: Card, playerIndex: number): void {
  const player = state.players[playerIndex];
  const n = state.players.length;
  const roundOver = player.hand.length === 0;
  let steps = 1;

  switch (card.type) {
    case 'SKIP': {
      const skipped = state.players[getNextPlayerIndex(state, playerIndex)];
      addLog(state, ctx, 'PLAYER_SKIPPED', `${skipped.name} is skipped`, { playerId: skipped.id });
      steps = 2;
      break;
    }
    case 'REVERSE': {
      state.direction = reverseDirection(state.direction);
      addLog(state, ctx, 'DIRECTION_CHANGED', `Direction is now ${state.direction}`, { playerId: player.id });
      if (n === 2) {
        // With two players Reverse acts like Skip.
        const skipped = state.players[getNextPlayerIndex(state, playerIndex)];
        addLog(state, ctx, 'PLAYER_SKIPPED', `${skipped.name} is skipped`, { playerId: skipped.id });
        steps = 2;
      }
      break;
    }
    case 'DRAW_TWO':
    case 'WILD_DRAW_FOUR': {
      const amount = card.type === 'DRAW_TWO' ? 2 : 4;
      if (state.settings.stacking && !roundOver) {
        state.pendingDraw += amount;
        addLog(state, ctx, 'DRAW_PENALTY', `Draw stack is now ${state.pendingDraw}`, { amount: state.pendingDraw });
      } else {
        const total = state.pendingDraw + amount;
        state.pendingDraw = 0;
        applyDrawPenalty(state, ctx, getNextPlayerIndex(state, playerIndex), total);
        steps = 2;
      }
      break;
    }
    default:
      break;
  }

  if (roundOver) {
    endRound(state, ctx, playerIndex);
    return;
  }
  advanceTurn(state, playerIndex, steps);
}

/** Ends the round won by the player at `winnerIndex` and updates cumulative scores. */
export function endRound(state: GameState, ctx: EngineContext, winnerIndex: number): void {
  const winner = state.players[winnerIndex];
  const result = calculateRoundScore(state, winner.id);

  state.rounds.push(result);
  state.winnerId = winner.id;
  state.pendingAction = null;
  state.pendingDraw = 0;
  state.status = 'ROUND_OVER';

  if (result.winningTeamId) {
    state.teamScores[result.winningTeamId] = (state.teamScores[result.winningTeamId] ?? 0) + result.points;
  }
  state.scores[winner.id] = (state.scores[winner.id] ?? 0) + result.points;

  addLog(state, ctx, 'ROUND_ENDED', `${winner.name} wins round ${state.roundNumber} (+${result.points} points)`, {
    playerId: winner.id,
    amount: result.points,
  });

  if (result.winningTeamId && state.teamScores[result.winningTeamId] >= state.settings.targetScore) {
    state.status = 'GAME_OVER';
    state.gameWinnerTeamId = result.winningTeamId;
    state.gameWinnerId = winner.id;
    addLog(state, ctx, 'GAME_ENDED', `Team ${result.winningTeamId} wins the game`, { playerId: winner.id });
  } else if (!state.settings.teamMode && state.scores[winner.id] >= state.settings.targetScore) {
    state.status = 'GAME_OVER';
    state.gameWinnerId = winner.id;
    addLog(state, ctx, 'GAME_ENDED', `${winner.name} wins the game`, { playerId: winner.id });
  }
}

