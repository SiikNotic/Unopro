import { useContext } from 'react';
import { PreferencesContext } from './preferencesContext';
import type { PreferencesContextValue } from './preferencesContext';

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}

/** Short vibration when the player enabled it and the device supports it. */
export function vibrate(enabled: boolean, pattern: number | number[] = 30): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // optional
  }
}
