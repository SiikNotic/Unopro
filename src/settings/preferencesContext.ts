import { createContext } from 'react';
import type { Preferences } from './preferences';

export interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);
