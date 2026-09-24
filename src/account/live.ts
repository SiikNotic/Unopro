// Live database changes over Supabase Realtime (postgres_changes). RLS decides which rows a subscriber
// receives: a player only their own, staff what their policies allow. Loaded on demand.
import { tokenFor } from '@/games/online/client';
import type { OnlineConfig } from '@/games/online/client';

export interface LiveSpec {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
}

export interface LiveChange {
  table: string;
  eventType: string;
  row: Record<string, unknown> | null;
}

/** Subscribes to changes; returns a function that closes everything it opened (safe to call twice). */
export async function subscribeLive(cfg: OnlineConfig, name: string, specs: LiveSpec[], onChange: (c: LiveChange) => void, onState?: (live: boolean) => void): Promise<() => void> {
  const token = await tokenFor(cfg);
  if (!token) {
    onState?.(false);
    return () => {};
  }
  const { RealtimeClient } = await import('@supabase/realtime-js');
  const client = new RealtimeClient(`${cfg.base.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: cfg.apiKey } });
  await client.setAuth(token);
  let channel = client.channel(name);
  for (const s of specs) {
    channel = channel.on('postgres_changes', { event: s.event ?? '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, (payload) => {
      const p = payload as { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> };
      const row = p.new && Object.keys(p.new).length ? p.new : (p.old ?? null);
      onChange({ table: s.table, eventType: p.eventType ?? '', row });
    });
  }
  channel.subscribe((status) => onState?.(status === 'SUBSCRIBED'));
  // Access tokens last an hour: hand Realtime a fresh one now and then.
  const refresh = window.setInterval(() => {
    void tokenFor(cfg).then((t) => {
      if (t) void client.setAuth(t);
    });
  }, 10 * 60 * 1000);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    window.clearInterval(refresh);
    void client.removeChannel(channel);
    client.disconnect();
  };
}
