import type { Card, CardColor, GameState } from './types';

export function canPlayCard(card: Card, state: GameState): boolean {
  // Wild can always be played
  if (card.type === 'wild' || card.type === 'wild_draw_four') {
    return true;
  }

  const activeCard = state.activeCard;
  const activeColor = state.activeColor;
  if (!activeCard || !activeColor) return false;

  // Match by color
  if (card.color === activeColor) return true;

  // Match by type/value
  if (card.type === activeCard.type) {
    if (card.type === 'number') {
      return card.value === activeCard.value;
    }
    return true; // skip/reverse/draw_two match by type
  }

  return false;
}

export function getPlayableCards(state: GameState, playerId: string): Card[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  return player.hand.filter((card) => canPlayCard(card, state));
}

export function isPlayerTurn(state: GameState, playerId: string): boolean {
  const current = state.players[state.currentPlayerIndex];
  return current?.id === playerId;
}

export function hasPlayableCard(state: GameState, playerId: string): boolean {
  return getPlayableCards(state, playerId).length > 0;
}
