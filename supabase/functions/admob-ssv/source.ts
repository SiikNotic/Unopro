// Supabase Edge Function (Deno): AdMob rewarded-ad server-side verification (see src/bank/server/admobSsv.ts).
// Called by Google, not by the app, so it runs without a Supabase JWT (verify_jwt = false); every request
// must instead carry Google's signature. Built into index.ts by `npm run functions:build`.
// Environment: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (injected by Supabase), and optionally
// ADMOB_AD_UNIT (the number after "/" in the rewarded ad unit id) to accept only that ad unit.
import { ADMOB_KEYS_URL, createSsvHandler, importAdmobKeys } from '../../../src/bank/server/admobSsv.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response> | Response): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEYS_TTL_MS = 12 * 60 * 60 * 1000;

let cached: { at: number; keys: Map<string, CryptoKey> } | null = null;
async function keys(refresh = false): Promise<Map<string, CryptoKey>> {
  if (!refresh && cached && Date.now() - cached.at < KEYS_TTL_MS) return cached.keys;
  // A forced refresh (unknown key id) at most once a minute, so bogus key ids can't make us hammer Google.
  if (refresh && cached && Date.now() - cached.at < 60_000) return cached.keys;
  const res = await fetch(ADMOB_KEYS_URL);
  if (!res.ok) {
    if (cached) return cached.keys;
    throw new Error('keys unavailable');
  }
  cached = { at: Date.now(), keys: await importAdmobKeys(await res.json()) };
  return cached.keys;
}

const handler = createSsvHandler({
  keys,
  adUnit: Deno.env.get('ADMOB_AD_UNIT') || null,
  async grant(userId, transactionId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bank_grant_ad_reward`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ p_user: userId, p_provider: 'admob', p_reward_id: transactionId }),
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) return { ok: false, code: String((body as { code?: unknown } | null)?.code ?? res.status) };
    const row = (body as { status: string; reason: string | null; replayed: boolean }[])[0];
    return row ? { ok: true, status: row.status, reason: row.reason, replayed: row.replayed } : { ok: false, code: 'empty' };
  },
});

Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch {
    return new Response(JSON.stringify({ error: 'server' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
