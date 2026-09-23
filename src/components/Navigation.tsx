import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Screen } from '@/types/navigation';

interface NavigationContextValue {
  currentScreen: Screen;
  navigate: (screen: Screen) => void;
  goHome: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');

  const navigate = useCallback((screen: Screen) => {
    setCurrentScreen(screen);
  }, []);

  const goHome = useCallback(() => setCurrentScreen('home'), []);

  const value = { currentScreen, navigate, goHome };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
