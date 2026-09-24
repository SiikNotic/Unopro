// Supabase Edge Function (Deno): POST { requestId, machine, bet } -> receipt; GET ?requestId= -> receipt
// or 404; GET ?balance=1 -> { balance }. Environment (set in the Supabase dashboard, never committed):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  (provided by Supabase automatically)
//   ALLOWED_ORIGIN  e.g. https://siiknotic.github.io
import { handleSlotRequest } from '../_shared/slotHandler.ts';
import { postgrestStore } from '../_shared/postgrestStore.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response> | Response): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '';
const store = postgrestStore(SUPABASE_URL, SERVICE_KEY);

// Simple per-instance limit: at most 8 requests per second per player.
const hits = new Map<string, number[]>();
function allow(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 1000);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 10000) hits.clear();
  return recent.length <= 8;
}

/** The player's id, verified by Supabase Auth from the bearer token (never taken from the request body). */
async function verifiedUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, authorization: auth } });
  if (!res.ok) return null;
  const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return typeof user?.id === 'string' ? user.id : null;
}

Deno.serve(async (req) => {
  const cors = {
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let body: unknown = null;
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > 1024) return Response.json({ code: 'invalid_bet' }, { status: 413, headers: cors });
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ code: 'invalid_bet' }, { status: 400, headers: cors });
    }
  }
  const out = await handleSlotRequest({ method: req.method, url: req.url, userId: await verifiedUser(req), body }, { store, allow });
  return Response.json(out.body, { status: out.status, headers: { ...cors, 'cache-control': 'no-store' } });
});
