// Supabase Edge Function (Deno) for online Domino and Bingo rooms: POST { op, ... } → { ok, view } | { ok, code }.
// Built into index.ts by `npm run functions:build` (esbuild bundles the shared engines). Environment,
// injected by Supabase (never committed): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { handleRoomRequest } from '../../../src/games/online/server/handler.ts';
import { postgrestRoomStore } from '../_shared/roomStore.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response> | Response): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** Where the game is served from. Origins are public information, not secrets. */
const ALLOWED = new Set(['https://siiknotic.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']);
const store = postgrestRoomStore(SUPABASE_URL, SERVICE_KEY);

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
  if (text.length > 2048) return Response.json({ ok: false, code: 'bad_request' }, { status: 413, headers: cors });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, code: 'bad_request' }, { status: 400, headers: cors });
  }
  try {
    const out = await handleRoomRequest(await verifiedUser(req), body, { store, allow });
    const status = out.ok ? 200 : out.code === 'unauthorized' ? 401 : out.code === 'rate_limited' ? 429 : out.code === 'not_found' ? 404 : 400;
    return Response.json(out, { status, headers: { ...cors, 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('game-room', e instanceof Error ? e.message : e);
    return Response.json({ ok: false, code: 'busy' }, { status: 503, headers: cors });
  }
});
