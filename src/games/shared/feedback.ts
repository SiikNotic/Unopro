// One place that turns a gameplay moment into sound + vibration + a visual burst, honouring Settings
// (Sound, Vibration, Animations). Components call fire('placed') instead of wiring each channel.
import { useCallback } from 'react';
import { playFx } from '@/audio/gameFx';
import type { FxEvent, FxGame } from '@/audio/gameFx';
import { usePreferences } from '@/settings/usePreferences';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

export type { FxEvent, FxGame };

/** Short, distinct patterns: a tap for placing/marking, a buzz for errors, a flourish for wins. */
export const VIBRATION: Partial<Record<FxEvent, number | number[]>> = {
  placed: 14,
  mark: 12,
  invalid: [28, 40, 28],
  claim: [30, 40, 60],
  roundWon: [30, 50, 70],
  gameWon: [40, 60, 40, 60, 140],
};

/** Moments that also throw particles (only when animations are allowed). */
export const BURST: Partial<Record<FxEvent, number>> = { claim: 40, roundWon: 60, gameWon: 120 };

export interface FxBurst {
  game: FxGame;
  event: FxEvent;
  count: number;
}

export const FX_EVENT = 'games:fx';

export function useFeedback(game: FxGame) {
  const { preferences } = usePreferences();
  const { haptics, animations } = preferences;
  return useCallback(
    (event: FxEvent, opts: { delay?: number; silent?: boolean } = {}) => {
      if (!opts.silent) playFx(game, event, opts.delay ?? 0);
      const pattern = VIBRATION[event];
      if (haptics && pattern !== undefined && typeof navigator !== 'undefined') navigator.vibrate?.(pattern);
      const count = BURST[event];
      if (count && animations && !prefersReducedMotion() && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<FxBurst>(FX_EVENT, { detail: { game, event, count } }));
      }
    },
    [game, haptics, animations]
  );
}
