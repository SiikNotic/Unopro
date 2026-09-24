import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { storage } from '@/storage';
import { normalizePreferences } from './preferences';
import type { Preferences } from './preferences';
import { PreferencesContext } from './preferencesContext';
import { setSoundEnabled } from '@/audio/sfx';
import { configureMusic, installMusic } from '@/audio/music';

const STORAGE_KEY = 'carta.preferences';

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => normalizePreferences(storage.get(STORAGE_KEY)));

  const setPreference = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      storage.set(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Animations OFF behaves like prefers-reduced-motion across the whole app.
  useEffect(() => {
    document.documentElement.dataset.motion = preferences.animations ? 'on' : 'off';
  }, [preferences.animations]);

  useEffect(() => setSoundEnabled(preferences.sound), [preferences.sound]);

  // Background music follows both the Sound switch and its own switch and volume.
  useEffect(() => installMusic(), []);
  useEffect(
    () => configureMusic({ enabled: preferences.sound && preferences.music, volume: preferences.musicVolume }),
    [preferences.sound, preferences.music, preferences.musicVolume]
  );

  const value = useMemo(() => ({ preferences, setPreference }), [preferences, setPreference]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
