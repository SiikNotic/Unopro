// Browser side of online rooms: anonymous Supabase session, calls to the game-room function, and a
// Realtime subscription to this player's own view row. Nothing here decides anything: the server does.
import { createAnonAuth } from '@/casino/premium/anonAuth';
import type { RoomRequest, RoomResponse, RoomView } from './protocol';

// Configured at build time; none of these is a secret (the publishable key is public by design).
//   VITE_SUPABASE_URL       https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY  the project's publishable key
//   VITE_GAMES_API_URL      optional, defaults to <VITE_SUPABASE_URL>/functions/v1/game-room
export interface OnlineConfig {
  base: string;
  apiUrl: string;
  apiKey: string;
}

export function onlineConfig(env: Record<string, unknown> = import.meta.env): OnlineConfig | null {
  const base = env.VITE_SUPABASE_URL;
  const apiKey = env.VITE_SUPABASE_ANON_KEY;
  if (typeof base !== 'string' || typeof apiKey !== 'string' || !apiKey) return null;
  const ok = (u: string) => /^https:\/\//.test(u) || (env.DEV === true && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u));
  const b = base.replace(/\/$/, '');
  const api = typeof env.VITE_GAMES_API_URL === 'string' && env.VITE_GAMES_API_URL ? env.VITE_GAMES_API_URL : `${b}/functions/v1/game-room`;
  if (!ok(b) || !ok(api)) return null;
  return { base: b, apiUrl: api.replace(/\/$/, ''), apiKey };
}

const tokens = new Map<string, () => Promise<string | null>>();
export function tokenFor(cfg: OnlineConfig): Promise<string | null> {
  let get = tokens.get(cfg.base);
  if (!get) {
    get = createAnonAuth({ authUrl: `${cfg.base}/auth/v1`, apiKey: cfg.apiKey });
    tokens.set(cfg.base, get);
  }
  return get();
}

const isView = (v: unknown): v is RoomView => {
  const x = v as Partial<RoomView> | null;
  return !!x && typeof x.code === 'string' && typeof x.version === 'number' && typeof x.you === 'string' && Array.isArray(x.members);
};

/** One request to the room server. Network trouble comes back as { ok: false, code: 'busy' }. */
export async function roomCall(cfg: OnlineConfig, req: RoomRequest, fetchImpl: typeof fetch = fetch): Promise<RoomResponse> {
  const token = await tokenFor(cfg);
  if (!token) return { ok: false, code: 'unauthorized' };
  try {
    const res = await fetchImpl(cfg.apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: cfg.apiKey, authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => null)) as RoomResponse | null;
    if (body && body.ok === true && isView(body.view)) return body;
    if (body && body.ok === false && typeof body.code === 'string') return body;
    return { ok: false, code: 'busy' };
  } catch {
    return { ok: false, code: 'busy' };
  }
}

export type LinkState = 'connecting' | 'live' | 'polling';

/**
 * Pushes this player's view whenever the server writes it (Realtime postgres_changes on room_views; RLS
 * makes sure only this player's own row ever arrives). Loaded on demand. Returns an unsubscribe function.
 */
export async function subscribeView(cfg: OnlineConfig, roomId: string, onView: (v: RoomView) => void, onState: (s: LinkState) => void): Promise<() => void> {
  const token = await tokenFor(cfg);
  if (!token) {
    onState('polling');
    return () => {};
  }
  const { RealtimeClient } = await import('@supabase/realtime-js');
  const client = new RealtimeClient(`${cfg.base.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: cfg.apiKey } });
  await client.setAuth(token);
  const channel = client
    .channel(`room-view-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_views', filter: `room_id=eq.${roomId}` }, (payload) => {
      const row = (payload as { new?: { view?: unknown } }).new;
      if (row && isView(row.view)) onView(row.view);
    })
    .subscribe((status) => onState(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'polling' : 'connecting'));
  return () => {
    void client.removeChannel(channel);
    client.disconnect();
  };
}
