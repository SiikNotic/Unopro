export type Screen = 'home' | 'gameModes' | 'settings' | 'tutorial' | 'play';

export type ScreenChangeEvent = { from: Screen | null; to: Screen };

export interface ScreenChangeEventDetail {
  from: Screen | null;
  to: Screen;
}
