import type { GameSettings } from './types';

/** Official rules only — every house rule starts disabled. */
export const DEFAULT_SETTINGS: GameSettings = {
  startingCards: 7,
  targetScore: 500,
  stacking: false,
  jumpIn: false,
  drawUntilPlayable: false,
  forcePlay: false,
  unoPenalty: 2,
  turnTimer: 0,
  teamMode: false,
  strictWildDrawFour: true,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
