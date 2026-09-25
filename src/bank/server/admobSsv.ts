// AdMob rewarded-ad server-side verification (SSV).
//
// When a viewer earns a reward, Google requests our callback URL with the event in the query string:
//   ?ad_network=…&ad_unit=…&custom_data=…&reward_amount=…&reward_item=…&timestamp=…&transaction_id=…
//    &user_id=…&signature=…&key_id=…
// `signature` is an ECDSA P-256 / SHA-256 signature (DER, URL-safe base64) of everything before
// "&signature=", made with the key `key_id` from https://www.gstatic.com/admob/reward/verifier-keys.json.
// Only a request that passes this check can pay, and it pays through bank_grant_ad_reward, which is
// idempotent on Google's transaction_id (a retried or replayed callback never pays twice).

export const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

export interface SsvParams {
  adNetwork: string;
  adUnit: string;
  customData: string;
  rewardAmount: string;
  rewardItem: string;
  timestamp: string;
  transactionId: string;
  userId: string;
  keyId: string;
}

export type SsvVerdict = { ok: true; params: SsvParams } | { ok: false; reason: 'malformed' | 'unknown_key' | 'bad_signature' };

const b64urlToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** DER ECDSA signature → the raw r||s form WebCrypto expects (P-256: 32 + 32 bytes). */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> | null {
  let i = 0;
  if (der[i++] !== 0x30) return null;
  let len = der[i++];
  if (len & 0x80) i += len & 0x7f; // long form length (not expected for P-256, tolerated)
  const out = new Uint8Array(size * 2);
  for (let part = 0; part < 2; part++) {
    if (der[i++] !== 0x02) return null;
    len = der[i++];
    let int = der.subarray(i, i + len);
    i += len;
    while (int.length > size && int[0] === 0) int = int.subarray(1);
    if (int.length > size) return null;
    out.set(int, part * size + (size - int.length));
  }
  return out;
}

/** Imports Google's published keys ({ keys: [{ keyId, base64 }] }, base64 = DER SubjectPublicKeyInfo). */
export async function importAdmobKeys(json: unknown): Promise<Map<string, CryptoKey>> {
  const keys = new Map<string, CryptoKey>();
  const list = (json as { keys?: { keyId?: unknown; base64?: unknown }[] })?.keys ?? [];
  for (const k of list) {
    if (typeof k.base64 !== 'string' || k.keyId === undefined) continue;
    const der = Uint8Array.from(atob(k.base64), (c) => c.charCodeAt(0));
    keys.set(String(k.keyId), await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
  }
  return keys;
}

/** Checks a callback's raw query string (without the leading "?") against Google's keys. */
export async function verifyAdmobSsv(rawQuery: string, keys: Map<string, CryptoKey>): Promise<SsvVerdict> {
  const cut = rawQuery.indexOf('&signature=');
  if (cut <= 0) return { ok: false, reason: 'malformed' };
  const message = rawQuery.slice(0, cut);
  const q = new URLSearchParams(rawQuery);
  const signature = q.get('signature');
  const keyId = q.get('key_id');
  if (!signature || !keyId) return { ok: false, reason: 'malformed' };
  const key = keys.get(keyId);
  if (!key) return { ok: false, reason: 'unknown_key' };
  let raw: Uint8Array | null;
  try {
    raw = derToRaw(b64urlToBytes(signature));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!raw) return { ok: false, reason: 'malformed' };
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw as Uint8Array<ArrayBuffer>, new TextEncoder().encode(message));
  if (!valid) return { ok: false, reason: 'bad_signature' };
  const g = (k: string) => q.get(k) ?? '';
  return {
    ok: true,
    params: {
      adNetwork: g('ad_network'),
      adUnit: g('ad_unit'),
      customData: g('custom_data'),
      rewardAmount: g('reward_amount'),
      rewardItem: g('reward_item'),
      timestamp: g('timestamp'),
      transactionId: g('transaction_id'),
      userId: g('user_id'),
      keyId,
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SsvDeps {
  /** Google's keys (cached by the caller; `refresh` forces a new download for an unknown key id). */
  keys: (refresh?: boolean) => Promise<Map<string, CryptoKey>>;
  /** bank_grant_ad_reward with the service role. Resolves with the database answer or a Postgres error code. */
  grant: (userId: string, transactionId: string) => Promise<{ ok: true; status: string; reason: string | null; replayed: boolean } | { ok: false; code: string }>;
  /** When set, only callbacks for this ad unit (the number after "/" in ca-app-pub-…/NNN) pay. */
  adUnit?: string | null;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * The callback endpoint. Answers 200 once an event is settled (paid, already paid, or deliberately not
 * paid) so Google stops retrying, 400/403 for requests that aren't genuine, and 500 only when the
 * database couldn't be reached (Google retries later; the transaction id keeps that safe).
 */
export function createSsvHandler(deps: SsvDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== 'GET') return json(405, { error: 'method' });
    const url = req.url;
    const rawQuery = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    let verdict = await verifyAdmobSsv(rawQuery, await deps.keys());
    if (!verdict.ok && verdict.reason === 'unknown_key') verdict = await verifyAdmobSsv(rawQuery, await deps.keys(true));
    if (!verdict.ok) return json(verdict.reason === 'malformed' ? 400 : 403, { error: verdict.reason });
    const p = verdict.params;
    // AdMob's "Verify URL" button sends a signed test callback without a player: nothing to pay.
    if (!p.userId && !p.transactionId) return json(200, { result: 'verified' });
    if (!UUID.test(p.userId) || !p.transactionId) return json(200, { result: 'ignored', reason: 'no_player' });
    if (deps.adUnit && p.adUnit !== deps.adUnit) return json(200, { result: 'ignored', reason: 'other_ad_unit' });
    const r = await deps.grant(p.userId.toLowerCase(), p.transactionId);
    if (!r.ok) return r.code === 'P0404' ? json(200, { result: 'ignored', reason: 'no_such_user' }) : json(500, { error: 'server' });
    return json(200, { result: r.status, reason: r.reason, replayed: r.replayed });
  };
}
