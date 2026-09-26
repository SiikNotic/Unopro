// Which games the owner has in service ("en servicio / fuera de servicio"), read from the database's
// public game_availability table. This only decides what the app SHOWS: a game out of service opens a
// clear notice instead of a new match. The decision itself is enforced by the servers (the game-room and
// casino edge functions and the database refuse new matches, stakes and slot rounds), so a modified
// browser that ignores this gains nothing. If the table can't be read, games show as in service and the
// servers still refuse what they must.
import { useEffect, useSyncExternalStore } from 'react';
import { onlineConfig } from '@/games/online/client';
import type { OnlineConfig } from '@/games/online/client';
import type { ControlledGame } from '@/games/online/protocol';
import type { Screen } from '@/types/navigation';

export type { ControlledGame };
export const CONTROLLED_GAMES: ControlledGame[] = ['slots', 'domino', 'carta', 'bingo'];

export type Availability = Record<ControlledGame, boolean>;
const ALL_ON: Availability = { slots: true, domino: true, carta: true, bingo: true };

let current: Availability = ALL_ON;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Parses the table rows; unknown games and malformed rows are ignored. */
export function parseAvailability(rows: unknown): Availability | null {
  if (!Array.isArray(rows)) return null;
  const next = { ...ALL_ON };
  for (const r of rows) {
    const row = r as { game?: unknown; enabled?: unknown } | null;
    if (row && CONTROLLED_GAMES.includes(row.game as ControlledGame) && typeof row.enabled === 'boolean') next[row.game as ControlledGame] = row.enabled;
  }
  return next;
}

/** Reads the table with the public (publishable) key only: no session is needed or created. */
export async function fetchAvailability(cfg: OnlineConfig, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<Availability | null> {
  try {
    const res = await fetchImpl(`${cfg.base}/rest/v1/game_availability?select=game,enabled`, { headers: { apikey: cfg.apiKey, authorization: `Bearer ${cfg.apiKey}` } });
    return res.ok ? parseAvailability(await res.json()) : null;
  } catch {
    return null;
  }
}

let inflight: Promise<void> | null = null;
/** Refreshes the shared copy (one request at a time). */
export function refreshAvailability(): Promise<void> {
  const cfg = onlineConfig();
  if (!cfg) return Promise.resolve();
  inflight ??= fetchAvailability(cfg)
    .then((next) => {
      if (!next) return;
      const changed = CONTROLLED_GAMES.some((g) => next[g] !== current[g]);
      current = next;
      loaded = true;
      if (changed) emit();
    })
    .finally(() => (inflight = null));
  return inflight;
}

/** Sets the shared copy directly (after the owner changed a game, and in tests). */
export function setAvailability(next: Availability) {
  current = next;
  loaded = true;
  emit();
}

const REFRESH_MS = 30000;
let timer: number | null = null;
const onVisible = () => {
  if (!document.hidden) void refreshAvailability();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined' && onlineConfig()) {
    void refreshAvailability();
    timer = window.setInterval(onVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/** The games in service, kept current (every 30 s and whenever the app comes back to the foreground). */
export function useGameAvailability(): Availability {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** Re-reads the table when a screen of a controlled game opens, so a change shows up at once. */
export function useFreshAvailability(game: ControlledGame | null): boolean {
  const all = useGameAvailability();
  useEffect(() => {
    if (game) void refreshAvailability();
  }, [game]);
  return game ? all[game] : true;
}

export const availabilityLoaded = () => loaded;

/**
 * The controlled game a screen starts, or null. Screens that show a match already running (an online room
 * with a code) are left alone: turning a game off stops new matches, not the ones being played.
 */
export function screenGame(screen: Screen, params: { game?: string; room?: string }): ControlledGame | null {
  switch (screen) {
    case 'slotLobby':
    case 'slotMachine':
    case 'slots':
      return 'slots';
    case 'dominoSetup':
      return 'domino';
    case 'bingoSetup':
      return 'bingo';
    case 'cartaSetup':
    case 'play':
      return 'carta';
    case 'domino':
    case 'bingo':
      return params.room ? null : screen;
    case 'room':
      return !params.room && (params.game === 'domino' || params.game === 'bingo' || params.game === 'carta') ? params.game : null;
    default:
      return null;
  }
}
