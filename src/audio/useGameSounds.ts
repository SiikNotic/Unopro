import { useEffect, useRef } from 'react';
import type { GameState } from '@/game/engine';
import { playSfx, unlockAudio } from './sfx';
import { soundsForChange } from './gameSounds';

/** Plays the sounds for every state change (player and bots alike). Silent when sound is off. */
export function useGameSounds(state: GameState, localPlayerId: string) {
  const prev = useRef<GameState | null>(null);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const sounds = soundsForChange(prev.current, state, localPlayerId);
    prev.current = state;
    sounds.forEach((name, i) => playSfx(name, i * 0.09));
  }, [state, localPlayerId]);
}
