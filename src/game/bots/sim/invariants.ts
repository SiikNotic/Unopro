// Independent sanity checks on every state produced during a simulation (test oracle, not game rules).
import type { GameAction, GameState } from '@/game/engine';
import { DECK_SIZE, getNextPlayerIndex } from '@/game/engine';

export function checkInvariants(prev: GameState, action: GameAction, next: GameState): string[] {
  const problems: string[] = [];
  const cards = [...next.deck, ...next.discardPile, ...next.players.flatMap((p) => p.hand)];
  if (cards.length !== DECK_SIZE) problems.push(`card count ${cards.length}`);
  if (new Set(cards.map((c) => c.id)).size !== cards.length) problems.push('duplicate card id');
  for (const p of next.players) if (p.cardsRemaining !== p.hand.length) problems.push(`cardsRemaining out of sync for ${p.id}`);
  if (next.discardPile.length === 0) problems.push('empty discard pile');
  if (next.currentPlayerIndex < 0 || next.currentPlayerIndex >= next.players.length) problems.push('currentPlayerIndex out of range');
  if (next.status === 'PLAYING' && next.currentColor === null && next.pendingAction?.type !== 'CHOOSE_COLOR') problems.push('no current color');
  if (!next.settings.stacking && next.pendingDraw !== 0) problems.push('pendingDraw without stacking');
  if (next.turnNumber < prev.turnNumber && next.roundNumber === prev.roundNumber) problems.push('turn number went backwards');
  if (next.status === 'ROUND_OVER' && !next.players.some((p) => p.hand.length === 0)) problems.push('round over without an empty hand');
  if (next.status === 'PLAYING' && next.players.some((p) => p.hand.length === 0)) problems.push('empty hand while still playing');

  // A plain number card (no jump-in, more than two players, round continues) must pass the turn to the next seat.
  if (action.type === 'PLAY_CARD' && next.status === 'PLAYING' && prev.players.length > 2 && !prev.settings.jumpIn) {
    const actorIndex = prev.players.findIndex((p) => p.id === action.playerId);
    const card = prev.players[actorIndex].hand.find((c) => c.id === action.cardId);
    if (card?.type === 'NUMBER' && next.currentPlayerIndex !== getNextPlayerIndex(prev, actorIndex, 1)) {
      problems.push('number card did not pass the turn to the next player');
    }
    if (card?.type === 'SKIP' && next.currentPlayerIndex !== getNextPlayerIndex(prev, actorIndex, 2)) {
      problems.push('skip did not skip exactly one player');
    }
  }
  return problems;
}
