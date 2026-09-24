// Supabase Edge Function (Deno): account coins for registered players (see src/casino/server/handler.ts).
// Built into index.ts by `npm run functions:build`. Environment, injected by Supabase (never committed):
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { handleCasinoRequest } from '../../../src/casino/server/handler.ts';
import type { CasinoUser } from '../../../src/casino/server/handler.ts';
import { postgrestCasinoStore } from '../_shared/casinoStore.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response> | Response): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/** Where the game is served from. Origins are public information, not secrets. */
const ALLOWED = new Set(['https://siiknotic.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']);
const store = postgrestCasinoStore(SUPABASE_URL, SERVICE_KEY);

// Per-instance limit: at most 8 requests per second per player.
const hits = new Map<string, number[]>();
function allow(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 1000);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 10000) hits.clear();
  return recent.length <= 8;
}

/** The player, verified by Supabase Auth from the bearer token (never taken from the body). */
async function verifiedUser(req: Request): Promise<CasinoUser | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, authorization: auth } });
  if (!res.ok) return null;
  const u = (await res.json().catch(() => null)) as { id?: unknown; is_anonymous?: unknown; email_confirmed_at?: unknown } | null;
  if (typeof u?.id !== 'string') return null;
  return { id: u.id, registered: u.is_anonymous !== true && typeof u.email_confirmed_at === 'string' };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'access-control-allow-origin': ALLOWED.has(origin) ? origin : 'https://siiknotic.github.io',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let body: unknown = null;
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > 4096) return Response.json({ code: 'bad_request' }, { status: 413, headers: cors });
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ code: 'bad_request' }, { status: 400, headers: cors });
    }
  }
  try {
    const out = await handleCasinoRequest({ method: req.method, url: req.url, user: await verifiedUser(req), body }, { store, allow });
    return Response.json(out.body, { status: out.status, headers: { ...cors, 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('casino', e instanceof Error ? e.message : e);
    return Response.json({ code: 'server' }, { status: 500, headers: cors });
  }
});
