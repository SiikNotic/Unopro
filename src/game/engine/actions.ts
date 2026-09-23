import type { CardColor, GameAction, GameState } from './types';
import { callUno, chooseColor, drawCards, endTurn, playCard, startNewRound } from './game';

export function validateAction(action: GameAction, state: GameState): { valid: boolean; error?: string } {
  const currentPlayer = state.players[state.currentPlayerIndex];

  switch (action.type) {
    case 'PLAY_CARD': {
      if (!currentPlayer || currentPlayer.id !== action.playerId) {
        return { valid: false, error: 'Not your turn' };
      }
      if (state.status !== 'PLAYING') {
        return { valid: false, error: 'Game is not in playing state' };
      }
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player) return { valid: false, error: 'Player not found' };
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return { valid: false, error: 'Card not in hand' };
      return { valid: true };
    }

    case 'DRAW_CARD': {
      if (!currentPlayer || currentPlayer.id !== action.playerId) {
        return { valid: false, error: 'Not your turn' };
      }
      if (state.status !== 'PLAYING') {
        return { valid: false, error: 'Game is not in playing state' };
      }
      return { valid: true };
    }

    case 'CHOOSE_COLOR': {
      if (state.status !== 'CHOOSING_COLOR') {
        return { valid: false, error: 'Not in color choosing state' };
      }
      return { valid: true };
    }

    case 'CALL_UNO': {
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player) return { valid: false, error: 'Player not found' };
      return { valid: true };
    }

    case 'END_TURN': {
      if (!currentPlayer || currentPlayer.id !== action.playerId) {
        return { valid: false, error: 'Not your turn' };
      }
      return { valid: true };
    }

    case 'PASS_TURN': {
      if (!currentPlayer || currentPlayer.id !== action.playerId) {
        return { valid: false, error: 'Not your turn' };
      }
      return { valid: true };
    }

    case 'START_GAME':
    case 'RESTART_GAME':
      return { valid: true };

    default:
      return { valid: false, error: 'Unknown action type' };
  }
}

export function applyAction(action: GameAction, state: GameState): GameState {
  const validation = validateAction(action, state);
  if (!validation.valid) {
    return {
      ...state,
      log: [...state.log, {
        type: 'ERROR' as const,
        timestamp: Date.now(),
        message: `Action rejected: ${validation.error}`,
        playerId: action.playerId,
      }],
      updatedAt: Date.now(),
    };
  }

  switch (action.type) {
    case 'PLAY_CARD':
      return playCard(state, action.playerId, action.cardId, action.chosenColor as CardColor | undefined);
    case 'DRAW_CARD':
      return drawCards(state, action.playerId, action.count ?? 1);
    case 'CHOOSE_COLOR':
      return chooseColor(state, action.playerId, action.color);
    case 'CALL_UNO':
      return callUno(state, action.playerId);
    case 'END_TURN':
      return endTurn(state, action.playerId);
    case 'PASS_TURN':
      return endTurn(state, action.playerId);
    case 'START_GAME':
    case 'RESTART_GAME':
      return startNewRound(state);
    default:
      return state;
  }
}

export function makeAction(
  type: GameAction['type'],
  playerId: string,
  extra?: Partial<GameAction>
): GameAction {
  return {
    type,
    playerId,
    timestamp: Date.now(),
    ...extra,
  } as GameAction;
}
