export * from './types';
export { LEVELS, levelById } from './levels';
export type { LevelDef, Difficulty } from './levels';
export { createGame, trySwap, applyBooster, boosterArea, hint, goalProgress, goalsDone, starsFor, specialFor, boardFrom, effectArea } from './resolve';
export type { GoalProgress } from './resolve';
export { SCORE, groupPoints, cascadeFactor } from './scoring';
export { findGroups, findMove, findRuns, isProductive, reshuffle, generateBoard } from './board';
