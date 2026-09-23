import type { Card, GameAction, GameState, Player, ValidationResult } from './types';
import { COLORS } from './types';
import { isWild } from './deck';

export function getTopCard(state: GameState): Card | undefined {
  return state.discardPile[state.discardPile.length - 1];
}

export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

export function getPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function isPlayerTurn(state: GameState, playerId: string): boolean {
  return getCurrentPlayer(state)?.id === playerId;
}

function findHolder(state: GameState, cardId: string): Player | undefined {
  return state.players.find((p) => p.hand.some((c) => c.id === cardId));
}

/** Whether `card` matches the table: current color, same number, same symbol, or a (legal) wild. */
export function matchesTable(card: Card, state: GameState, holder?: Player): boolean {
  const top = getTopCard(state);
  if (!top) return false;

  if (card.type === 'WILD') return true;
  if (card.type === 'WILD_DRAW_FOUR') {
    if (!state.settings.strictWildDrawFour) return true;
    const hand = holder?.hand ?? [];
    return !hand.some((c) => c.id !== card.id && c.color === state.currentColor);
  }

  if (card.color === state.currentColor) return true;
  if (card.type === 'NUMBER') return top.type === 'NUMBER' && top.value === card.value;
  return card.type === top.type;
}

/**
 * Whether the card can legally be played by whoever holds it, right now, on their own turn.
 * Accounts for a pending draw stack and for the "play the card you just drew" restriction.
 */
export function canPlayCard(card: Card, state: GameState): boolean {
  if (state.status !== 'PLAYING') return false;
  const pending = state.pendingAction;
  if (pending?.type === 'CHOOSE_COLOR') return false;
  if (pending?.type === 'PLAY_DRAWN_CARD' && pending.cardId !== card.id) return false;

  if (state.pendingDraw > 0) {
    // Only reachable with stacking enabled: answer +2 with +2 or +4, and +4 with +4.
    const top = getTopCard(state);
    if (card.type === 'WILD_DRAW_FOUR') return true;
    return card.type === 'DRAW_TWO' && top?.type === 'DRAW_TWO';
  }

  return matchesTable(card, state, findHolder(state, card.id));
}

export function getPlayableCards(state: GameState, playerId: string): Card[] {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  return player.hand.filter((card) => canPlayCard(card, state));
}

export function hasPlayableCard(state: GameState, playerId: string): boolean {
  return getPlayableCards(state, playerId).length > 0;
}

/** Jump-in (house rule): an identical card — same color and symbol — may be played out of turn. */
export function canJumpIn(card: Card, state: GameState): boolean {
  const top = getTopCard(state);
  if (!state.settings.jumpIn || !top || isWild(top) || isWild(card)) return false;
  if (state.pendingAction || state.pendingDraw > 0) return false;
  return card.color === top.color && card.type === top.type && card.value === top.value;
}

const fail = (error: string): ValidationResult => ({ valid: false, error });
const OK: ValidationResult = { valid: true };

/** Checks an action against the current state without modifying anything. */
export function validateAction(state: GameState, action: GameAction): ValidationResult {
  if (action.type === 'RESTART_GAME') return OK;
  if (action.type === 'START_GAME') {
    return state.status === 'WAITING' || state.status === 'ROUND_OVER'
      ? OK
      : fail(`Cannot start a round while the game is ${state.status}`);
  }

  if (state.status !== 'PLAYING') return fail(`Game is not being played (status ${state.status})`);
  const player = getPlayer(state, action.playerId);
  if (!player) return fail(`Unknown player ${action.playerId}`);
  const isTurn = isPlayerTurn(state, player.id);
  const pending = state.pendingAction;

  switch (action.type) {
    case 'PLAY_CARD': {
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail(`Card ${action.cardId} is not in ${player.name}'s hand`);
      if (action.chosenColor !== undefined && !COLORS.includes(action.chosenColor)) {
        return fail(`Invalid color ${action.chosenColor}`);
      }
      if (!isTurn) {
        return canJumpIn(card, state) ? OK : fail(`It is not ${player.name}'s turn`);
      }
      if (pending?.type === 'CHOOSE_COLOR') return fail('A color must be chosen first');
      if (pending?.type === 'PLAY_DRAWN_CARD' && pending.cardId !== card.id) {
        return fail('After drawing, only the drawn card may be played');
      }
      if (!canPlayCard(card, state)) return fail(`Card ${card.id} cannot be played now`);
      return OK;
    }

    case 'DRAW_CARD': {
      if (!isTurn) return fail(`It is not ${player.name}'s turn`);
      if (pending?.type === 'CHOOSE_COLOR') return fail('A color must be chosen first');
      if (pending?.type === 'PLAY_DRAWN_CARD') return fail('Already drew this turn — play the card or end the turn');
      if (state.settings.forcePlay && state.pendingDraw === 0 && hasPlayableCard(state, player.id)) {
        return fail('Force play is on: a playable card must be played');
      }
      return OK;
    }

    case 'CHOOSE_COLOR': {
      if (pending?.type !== 'CHOOSE_COLOR') return fail('No color choice is pending');
      if (pending.playerId !== player.id) return fail(`Only ${pending.playerId} may choose the color`);
      if (!COLORS.includes(action.color)) return fail(`Invalid color ${action.color}`);
      return OK;
    }

    case 'END_TURN': {
      if (!isTurn) return fail(`It is not ${player.name}'s turn`);
      if (pending?.type !== 'PLAY_DRAWN_CARD') return fail('You can only end the turn after drawing a playable card');
      if (state.settings.forcePlay) return fail('Force play is on: the drawn card must be played');
      return OK;
    }

    case 'CALL_UNO':
      // Always accepted; whether the call itself is valid is recorded in unoState.calls.
      return OK;

    case 'CHALLENGE_UNO': {
      const target = getPlayer(state, action.targetId);
      if (!target) return fail(`Unknown player ${action.targetId}`);
      if (target.id === player.id) return fail('You cannot challenge yourself');
      if (state.settings.unoPenalty <= 0) return fail('UNO penalty is disabled');
      if (state.unoState.penaltyWindowPlayerId !== target.id) return fail(`${target.name} cannot be penalised now`);
      return OK;
    }
  }
}
