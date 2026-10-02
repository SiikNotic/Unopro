// Supabase Edge Function (Deno): the weekly Discord giveaway, called by the Discord bot (BotGhost) and by the app
// (account link codes). The logic is src/discord/giveawayHandler.ts; this file wires the database, the user check
// and Deno. Built into index.ts by `npm run functions:build`. Environment, injected by Supabase (never committed):
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. The bot secret is stored only as a SHA-256 hash in
// discord_bot_config.
import { handleGiveawayRequest } from '../../../src/discord/giveawayHandler.ts';
import type { DbResult } from '../../../src/discord/giveawayHandler.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response> | Response): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Where the app is served from (link codes). The bot calls server to server, without an Origin. */
const ALLOWED = new Set(['https://siiknotic.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173']);
const admin = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };

async function rpc(name: string, args: Record<string, unknown>): Promise<DbResult> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: admin, body: JSON.stringify(args) });
  } catch {
    return { ok: false, error: { status: 0, code: 'network', message: 'network' } };
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (res.ok) return { ok: true, data: body };
  const b = (body && typeof body === 'object' ? body : {}) as { code?: string; message?: string; details?: string };
  return { ok: false, error: { status: res.status, code: b.code ?? String(res.status), message: b.message ?? '', details: b.details ?? undefined } };
}

async function botSecretHash(): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/discord_bot_config?select=secret_hash&id=eq.true&limit=1`, { headers: admin });
    if (!res.ok) return null;
    const rows = (await res.json()) as { secret_hash?: unknown }[];
    return typeof rows?.[0]?.secret_hash === 'string' ? rows[0].secret_hash : null;
  } catch {
    return null;
  }
}

async function verifyUser(authorization: string) {
  if (!authorization.startsWith('Bearer ')) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, authorization } });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: unknown; is_anonymous?: unknown; email_confirmed_at?: unknown };
    if (typeof u?.id !== 'string') return null;
    return { id: u.id, registered: u.is_anonymous !== true && typeof u.email_confirmed_at === 'string' };
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

function cors(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': ALLOWED.has(origin) ? origin : 'https://siiknotic.github.io',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-botghost-secret',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
}

Deno.serve(async (req: Request) => {
  const headers = { ...cors(req.headers.get('origin') ?? ''), 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    const out = await handleGiveawayRequest(
      {
        method: req.method,
        headers: { authorization: req.headers.get('authorization') ?? undefined, 'x-botghost-secret': req.headers.get('x-botghost-secret') ?? undefined },
        body: req.method === 'POST' ? await req.text() : '',
      },
      { rpc, botSecretHash, verifyUser, sha256Hex, log: (m) => console.error(m) }
    );
    return new Response(JSON.stringify(out.body), { status: out.status, headers });
  } catch (e) {
    console.error('discord-giveaway: unexpected', e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ ok: false, code: 'server', error: 'Error interno del servidor.' }), { status: 500, headers });
  }
});
