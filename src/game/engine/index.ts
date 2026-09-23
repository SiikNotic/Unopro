// Public API of the game engine. Framework-agnostic: nothing here imports React.
export * from './types';
export * from './settings';
export { createRng, randomSeed } from './rng';
export type { Rng } from './rng';
export {
  DECK_SIZE,
  createDeck,
  shuffleDeck,
  resetDeck,
  recycleDiscardPile,
  drawCard as drawCardFromPiles,
  drawCards as drawCardsFromPiles,
  isWild,
  getCardScore,
  getHandScore,
  cardLabel,
  makeCard,
} from './deck';
export type { Piles, DrawResult } from './deck';
export {
  canPlayCard,
  canJumpIn,
  getPlayableCards,
  hasPlayableCard,
  getTopCard,
  getCurrentPlayer,
  getPlayer,
  isPlayerTurn,
  validateAction,
} from './validation';
export { reverseDirection, getNextPlayerIndex } from './effects';
export { getLastUnoCall } from './uno';
export {
  calculateRoundScore,
  getTeamOf,
  getTeamPlayers,
  areTeammates,
  getRoundWinningTeam,
  getGameWinningTeam,
} from './scoring';
export * from './game';
export * from './actions';
