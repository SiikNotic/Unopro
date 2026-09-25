// Supabase Edge Function (Deno) for online rooms (Domino, Bingo, Carta) and coin tables (Blackjack, Roulette): POST { op, ... } → { ok, view } | { ok, code }.
// Built into index.ts by `npm run functions:build` (esbuild bundles the shared engines). Environment,
// injected by Supabase (never committed): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { handleRoomRequest } from '../../../src/games/online/server/handler.ts';
import type { TableWallet, WalletFailure } from '../../../src/games/online/server/handler.ts';
import { postgrestRoomStore } from '../_shared/roomStore.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response> | Response): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** Where the game is served from. Origins are public information, not secrets. */
const ALLOWED = new Set(['https://siiknotic.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']);
const store = postgrestRoomStore(SUPABASE_URL, SERVICE_KEY);

/** Service-role call to a database function; errors come back as their Postgres code. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(args),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) return { ok: false, code: String((body as { code?: unknown } | null)?.code ?? res.status) };
  return { ok: true, data: body as T };
}

const FAILURES: Record<string, WalletFailure> = { P0402: 'insufficient_funds', P0403: 'not_registered', P0451: 'banned', P0409: 'conflict', P0400: 'invalid' };

/** Account coins at the tables: table_player / table_bet / table_pay (see the tables migration). */
const wallet: TableWallet = {
  async player(userId) {
    const res = await rpc<{ registered: boolean; banned: boolean; balance: number }[]>('table_player', { p_user: userId });
    const row = res.ok ? res.data[0] : null;
    return row ? { registered: !!row.registered, banned: !!row.banned, balance: Number(row.balance) } : { registered: false, banned: false, balance: 0 };
  },
  async bet(userId, requestId, game, stake, detail) {
    const res = await rpc<{ balance: number; replayed: boolean }[]>('table_bet', { p_user: userId, p_request: requestId, p_game: game, p_stake: stake, p_detail: detail });
    if (!res.ok) return { ok: false, code: FAILURES[res.code] ?? 'server' };
    return { ok: true, balance: Number(res.data[0].balance), replayed: !!res.data[0].replayed };
  },
  async pay(userId, requestId, game, payout, detail) {
    const res = await rpc<{ balance: number }[]>('table_pay', { p_user: userId, p_request: requestId, p_game: game, p_payout: payout, p_detail: detail });
    if (!res.ok) return { ok: false, code: FAILURES[res.code] ?? 'server' };
    return { ok: true, balance: Number(res.data[0].balance) };
  },
};

store.findOpen = async (game, userId) => {
  const res = await rpc<string | null>('room_find_open', { p_game: game, p_user: userId });
  return res.ok && typeof res.data === 'string' ? res.data : null;
};

// Per-instance limit: ticks come every ~0.7 s, so 12 requests per second per player is generous.
const hits = new Map<string, number[]>();
function allow(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 1000);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 10000) hits.clear();
  return recent.length <= 12;
}

/** The player's id, verified by Supabase Auth from the bearer token (never taken from the body). */
async function verifiedUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, authorization: auth } });
  if (!res.ok) return null;
  const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return typeof user?.id === 'string' ? user.id : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'access-control-allow-origin': ALLOWED.has(origin) ? origin : 'https://siiknotic.github.io',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return Response.json({ ok: false, code: 'bad_request' }, { status: 405, headers: cors });
  const text = await req.text();
  if (text.length > 8192) return Response.json({ ok: false, code: 'bad_request' }, { status: 413, headers: cors });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, code: 'bad_request' }, { status: 400, headers: cors });
  }
  try {
    const out = await handleRoomRequest(await verifiedUser(req), body, { store, allow, wallet });
    const status = out.ok ? 200 : out.code === 'unauthorized' ? 401 : out.code === 'rate_limited' ? 429 : out.code === 'not_found' ? 404 : 400;
    return Response.json(out, { status, headers: { ...cors, 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('game-room', e instanceof Error ? e.message : e);
    return Response.json({ ok: false, code: 'busy' }, { status: 503, headers: cors });
  }
});
