import type { GameModeId } from '@/game/rules/modes';

export type Screen = 'home' | 'gameModes' | 'settings' | 'tutorial' | 'play' | 'blackjack' | 'roulette' | 'slots' | 'profile';

export const SCREENS: Screen[] = ['home', 'gameModes', 'settings', 'tutorial', 'play', 'blackjack', 'roulette', 'slots', 'profile'];

export interface ScreenParams {
  mode?: GameModeId;
  /** Open tutorial lesson. */
  topic?: string;
}

export type ScreenChangeEvent = { from: Screen | null; to: Screen };

export interface ScreenChangeEventDetail {
  from: Screen | null;
  to: Screen;
}
