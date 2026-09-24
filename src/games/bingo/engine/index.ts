// Public API of the Bingo engine. Framework-agnostic: nothing here imports React.
import type { GameRules } from '@/games/shared/multiplayer/types';
import { applyBingo } from './game';
import { parseBingoAction } from './parse';
import { bingoView } from './view';
import type { BingoView } from './view';
import type { BingoAction, BingoEvent, BingoState } from './types';

export * from './types';
export { FALSE_CLAIM_PENALTY, LINES, PLAYERS_MAX, PLAYERS_MIN, ROUND_POINTS, columnOf, completedLines, freshMarks, generateCard, hasBingo, letterOf, markable, nearLines } from './rules';
export { applyBingo, createBingo, validateBingo } from './game';
export { bingoView } from './view';
export type { BingoSeatView, BingoView } from './view';
export { parseBingoAction } from './parse';

export const bingoRules: GameRules<BingoState, BingoAction, BingoView, BingoEvent> = {
  id: 'bingo',
  apply: applyBingo,
  viewFor: bingoView,
  parseAction: parseBingoAction,
  isHouseAction: (a) => a.type === 'CALL_NUMBER' || a.type === 'CLOSE_ROUND',
};
