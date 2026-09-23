import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Screen, ScreenParams } from '@/types/navigation';

interface NavigationContextValue {
  currentScreen: Screen;
  params: ScreenParams;
  navigate: (screen: Screen, params?: ScreenParams) => void;
  goHome: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [params, setParams] = useState<ScreenParams>({});

  const navigate = useCallback((screen: Screen, nextParams: ScreenParams = {}) => {
    setCurrentScreen(screen);
    setParams(nextParams);
  }, []);

  const goHome = useCallback(() => navigate('home'), [navigate]);

  const value = { currentScreen, params, navigate, goHome };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
