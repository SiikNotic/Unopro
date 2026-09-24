import { useEffect } from 'react';
import { startAmbient, stopAmbient } from '@/audio/ambient';
import type { AmbientId } from '@/audio/ambient';
import { suspendMusic } from '@/audio/music';
import { usePreferences } from '@/settings/usePreferences';

/** Each game has its own music: while its screen is open it replaces the lobby's background music. */
export function useGameMusic(id: AmbientId) {
  const { preferences } = usePreferences();
  useEffect(() => {
    suspendMusic(true);
    return () => {
      stopAmbient();
      suspendMusic(false);
    };
  }, []);
  useEffect(() => {
    if (preferences.sound && preferences.music && preferences.musicVolume > 0) startAmbient(id, preferences.musicVolume);
    else stopAmbient();
  }, [id, preferences.sound, preferences.music, preferences.musicVolume]);
}
