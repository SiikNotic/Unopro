import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Screen, ScreenParams } from '@/types/navigation';
import { SCREENS } from '@/types/navigation';
import { GAME_MODES } from '@/game/rules/modes';

interface NavigationContextValue {
  currentScreen: Screen;
  params: ScreenParams;
  /** Goes to a screen (a new browser history entry, unless `replace`). */
  navigate: (screen: Screen, params?: ScreenParams, options?: { replace?: boolean }) => void;
  /** "Back" to a screen: reuses the browser's history when that screen is the one we came from. */
  back: (screen: Screen, params?: ScreenParams) => void;
  goHome: () => void;
}

interface Entry {
  screen: Screen;
  params: ScreenParams;
}

interface HistoryState extends Entry {
  carta: true;
  depth: number;
  prev: Entry | null;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

/** Only well-formed screens and params are accepted from history (it survives reloads and can be edited). */
function sanitize(raw: unknown): HistoryState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<HistoryState>;
  if (s.carta !== true || !SCREENS.includes(s.screen as Screen)) return null;
  return { carta: true, screen: s.screen as Screen, params: cleanParams(s.params), depth: typeof s.depth === 'number' && s.depth >= 0 ? s.depth : 0, prev: s.prev && SCREENS.includes(s.prev.screen) ? { screen: s.prev.screen, params: cleanParams(s.prev.params) } : null };
}

function cleanParams(raw: unknown): ScreenParams {
  if (!raw || typeof raw !== 'object') return {};
  const p = raw as ScreenParams;
  const out: ScreenParams = {};
  if (p.mode && GAME_MODES.some((m) => m.id === p.mode && m.enabled)) out.mode = p.mode;
  if (typeof p.topic === 'string' && /^[a-z]{2,16}$/.test(p.topic)) out.topic = p.topic;
  return out;
}

const sameEntry = (a: Entry | null, screen: Screen, params: ScreenParams) =>
  !!a && a.screen === screen && (a.params.topic ?? '') === (params.topic ?? '') && (a.params.mode ?? '') === (params.mode ?? '');

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry>(() => {
    const restored = typeof window !== 'undefined' ? sanitize(window.history.state) : null;
    // A reload during a Carta game goes back to the picker instead of silently dealing a new game.
    if (restored?.screen === 'play') return { screen: 'gameModes', params: {} };
    return restored ?? { screen: 'home', params: {} };
  });
  const state = useRef<HistoryState>({ carta: true, ...entry, depth: 0, prev: null });
  // True between calling history.back() and its popstate: a second tap must not go back twice.
  const popping = useRef(false);

  useEffect(() => {
    const restored = sanitize(window.history.state);
    state.current = { carta: true, ...entry, depth: restored?.depth ?? 0, prev: restored?.prev ?? null };
    window.history.replaceState(state.current, '');
    const onPop = (e: PopStateEvent) => {
      popping.current = false;
      let next = sanitize(e.state) ?? { carta: true as const, screen: 'home' as Screen, params: {}, depth: 0, prev: null };
      // Never re-enter a Carta game through back/forward: that would silently deal a brand-new game.
      if (next.screen === 'play') {
        next = { ...next, screen: 'gameModes', params: {} };
        window.history.replaceState(next, '');
      }
      state.current = next;
      setEntry({ screen: next.screen, params: next.params });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Runs once: syncs the first entry and listens for back/forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((screen: Screen, params: ScreenParams = {}, options: { replace?: boolean } = {}) => {
    const clean = cleanParams(params);
    const current = state.current;
    const next: HistoryState = options.replace
      ? { carta: true, screen, params: clean, depth: current.depth, prev: current.prev }
      : { carta: true, screen, params: clean, depth: current.depth + 1, prev: { screen: current.screen, params: current.params } };
    state.current = next;
    if (options.replace) window.history.replaceState(next, '');
    else window.history.pushState(next, '');
    setEntry({ screen, params: clean });
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(
    (screen: Screen, params: ScreenParams = {}) => {
      if (popping.current) return;
      const current = state.current;
      if (current.depth > 0 && sameEntry(current.prev, screen, params)) {
        popping.current = true;
        window.history.back();
        // Safety net: never leave back() blocked if the browser doesn't report the navigation.
        window.setTimeout(() => (popping.current = false), 800);
      } else navigate(screen, params, { replace: true });
    },
    [navigate]
  );

  const goHome = useCallback(() => back('home'), [back]);

  const value = { currentScreen: entry.screen, params: entry.params, navigate, back, goHome };
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within a NavigationProvider');
  return ctx;
}
