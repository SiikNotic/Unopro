// TEMPORARY stand-in so opponents take their turns while the real bots are built.
// No strategy: it takes the first legal option the engine offers. Replace in the bots phase.
import type { CardColor, GameAction, GameState } from '@/game/engine';
import { COLORS, getPlayableCards, getPlayer, isWild } from '@/game/engine';
import type { PlayerController } from './types';

function firstColorInHand(state: GameState, playerId: string): CardColor {
  const card = getPlayer(state, playerId)?.hand.find((c) => c.color !== 'WILD');
  return (card?.color as CardColor | undefined) ?? COLORS[0];
}

export const placeholderBot: PlayerController = {
  decide(state, playerId): GameAction | null {
    if (state.status !== 'PLAYING') return null;
    const pending = state.pendingAction;
    if (pending?.type === 'CHOOSE_COLOR') {
      return pending.playerId === playerId
        ? { type: 'CHOOSE_COLOR', playerId, color: firstColorInHand(state, playerId) }
        : null;
    }
    if (state.players[state.currentPlayerIndex].id !== playerId) return null;

    const player = getPlayer(state, playerId)!;
    const playable = getPlayableCards(state, playerId);
    if (player.hand.length === 2 && playable.length > 0 && !state.unoState.declaredPlayerIds.includes(playerId)) {
      return { type: 'CALL_UNO', playerId };
    }
    const card = playable[0];
    if (card) {
      return {
        type: 'PLAY_CARD',
        playerId,
        cardId: card.id,
        chosenColor: isWild(card) ? firstColorInHand(state, playerId) : undefined,
      };
    }
    if (pending?.type === 'PLAY_DRAWN_CARD') return { type: 'END_TURN', playerId };
    return { type: 'DRAW_CARD', playerId };
  },
};

/** Which player (if any) must act next, whoever controls them. */
export function getActingPlayerId(state: GameState): string | null {
  if (state.status !== 'PLAYING') return null;
  return state.pendingAction?.playerId ?? state.players[state.currentPlayerIndex].id;
}
