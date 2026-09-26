import { createContext, useContext } from 'react';
import type { Screen, ScreenParams } from '@/types/navigation';

export interface NavigationContextValue {
  currentScreen: Screen;
  params: ScreenParams;
  /** Goes to a screen (a new browser history entry, unless `replace`). */
  navigate: (screen: Screen, params?: ScreenParams, options?: { replace?: boolean }) => void;
  /** "Back" to a screen: reuses the browser's history when that screen is the one we came from. */
  back: (screen: Screen, params?: ScreenParams) => void;
  goHome: () => void;
}

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
