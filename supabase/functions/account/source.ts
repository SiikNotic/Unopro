// Supabase Edge Function (Deno): deletes the calling user's account (see src/account/server/deleteHandler.ts).
// Built into index.ts by `npm run functions:build`. Environment, injected by Supabase (never committed):
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { handleDeleteRequest } from '../../../src/account/server/deleteHandler.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response> | Response): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED = new Set(['https://siiknotic.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']);
const admin = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };

async function verifiedUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, authorization: auth } });
  if (!res.ok) return null;
  const u = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return typeof u?.id === 'string' ? { id: u.id } : null;
}

const deps = {
  async prepare(userId: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/account_delete_prepare`, { method: 'POST', headers: admin, body: JSON.stringify({ p_user: userId }) });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message === 'owner_protected' || body?.message === 'no_such_user' ? body.message : 'server');
    }
  },
  async deleteUser(userId: string) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  },
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'access-control-allow-origin': ALLOWED.has(origin) ? origin : 'https://siiknotic.github.io',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let body: unknown = null;
  const text = await req.text();
  if (text.length > 1024) return Response.json({ ok: false, code: 'bad_request' }, { status: 413, headers: cors });
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    return Response.json({ ok: false, code: 'bad_request' }, { status: 400, headers: cors });
  }
  try {
    const out = await handleDeleteRequest({ method: req.method, user: await verifiedUser(req), body }, deps);
    return Response.json(out.body, { status: out.status, headers: { ...cors, 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('account', e instanceof Error ? e.message : e);
    return Response.json({ ok: false, code: 'server' }, { status: 500, headers: cors });
  }
});
