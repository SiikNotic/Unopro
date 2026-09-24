// RoomStore over Supabase's REST gateway: the security-definer functions of the game_rooms migration,
// called with the service role key (server side only; never shipped to the browser).
import { RoomStoreError } from '../../../src/games/online/server/handler.ts';
import type { RoomRow, RoomStore, ViewOut } from '../../../src/games/online/server/handler.ts';

export function postgrestRoomStore(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch): RoomStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body as { code?: string } | null)?.code;
      if (code === 'P0409') throw new RoomStoreError('conflict');
      if (code === 'P0400') throw new RoomStoreError('invalid');
      throw new Error(`rpc ${fn} failed: ${res.status} ${code ?? ''}`);
    }
    return body as T;
  }
  const views = (out: ViewOut[]) => out.map((v) => ({ userId: v.userId, view: v.view }));
  return {
    async insert(room, makeViews) {
      // The row id is only known after the insert; views are rewritten with it by the first commit, and
      // the host's first view carries a placeholder id the client doesn't rely on until then.
      const id = await rpc<string>('room_insert', {
        p_code: room.code,
        p_game: room.game,
        p_seats: room.seats,
        p_host: room.host,
        p_members: room.members,
        p_settings: room.settings,
        p_views: views(makeViews('pending')),
      });
      return { ...room, id, status: 'lobby', state: null, clock: { lastAt: 0, lastCallAt: 0, closingAt: 0, roundOverAt: 0 }, version: 1 };
    },
    async load(code) {
      const row = await rpc<Record<string, unknown> | null>('room_load', { p_code: code });
      if (!row) return null;
      return {
        id: row.id as string,
        code: row.code as string,
        game: row.game as RoomRow['game'],
        seats: row.seats as number,
        host: row.host as string,
        status: row.status as RoomRow['status'],
        members: row.members as RoomRow['members'],
        settings: row.settings as RoomRow['settings'],
        state: (row.state ?? null) as RoomRow['state'],
        clock: { lastAt: 0, lastCallAt: 0, closingAt: 0, roundOverAt: 0, ...(row.clock as object) },
        version: row.version as number,
      };
    },
    async commit(room, out) {
      return rpc<number>('room_commit', {
        p_id: room.id,
        p_version: room.version,
        p_status: room.status,
        p_members: room.members,
        p_state: room.state,
        p_clock: room.clock,
        p_views: views(out),
      });
    },
  };
}
