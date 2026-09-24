// Public API of the Domino engine. Framework-agnostic: nothing here imports React.
import type { GameRules } from '@/games/shared/multiplayer/types';
import { applyDomino } from './game';
import { parseDominoAction } from './parse';
import { dominoView } from './view';
import type { DominoView } from './view';
import type { DominoAction, DominoEvent, DominoState } from './types';

export * from './types';
export * from './rules';
export { applyDomino, createDomino, currentPlayer, isBlocked, legalActionsFor, rematch, validateDomino } from './game';
export { dominoView } from './view';
export type { DominoSeatView, DominoView } from './view';
export { parseDominoAction } from './parse';

export const dominoRules: GameRules<DominoState, DominoAction, DominoView, DominoEvent> = {
  id: 'domino',
  apply: applyDomino,
  viewFor: dominoView,
  parseAction: parseDominoAction,
};
