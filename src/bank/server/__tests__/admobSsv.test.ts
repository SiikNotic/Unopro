import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSsvHandler, derToRaw, importAdmobKeys, verifyAdmobSsv } from '../admobSsv';
import type { SsvDeps } from '../admobSsv';

// A key pair standing in for Google's: we sign callbacks exactly the way AdMob does (DER, URL-safe base64).
let keyPair: CryptoKeyPair;
let keys: Map<string, CryptoKey>;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (x: Uint8Array) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    let v = x.subarray(i);
    if (v[0] & 0x80) v = Uint8Array.from([0, ...v]);
    return [0x02, v.length, ...v];
  };
  const body = [...int(raw.subarray(0, 32)), ...int(raw.subarray(32))];
  return Uint8Array.from([0x30, body.length, ...body]);
}
async function signed(query: string, keyId = '1234'): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, new TextEncoder().encode(query)));
  return `${query}&signature=${b64url(rawToDer(sig))}&key_id=${keyId}`;
}
const USER = 'af2535e0-e855-4206-bab0-9150262ce3d2';
const event = (tx = 'tx-1', user = USER, unit = '5224354917') =>
  `ad_network=5450213213286189855&ad_unit=${unit}&custom_data=${user}&reward_amount=1&reward_item=Reward&timestamp=1790000000000&transaction_id=${tx}&user_id=${user}`;

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  keys = await importAdmobKeys({ keys: [{ keyId: 1234, pem: 'unused', base64: btoa(String.fromCharCode(...spki)) }] });
});

describe('AdMob SSV signature', () => {
  it('accepts a genuine callback and reads its fields', async () => {
    const v = await verifyAdmobSsv(await signed(event()), keys);
    expect(v.ok).toBe(true);
    expect(v.ok && v.params).toMatchObject({ userId: USER, transactionId: 'tx-1', adUnit: '5224354917', keyId: '1234' });
  });

  it('rejects any change to the signed fields', async () => {
    const q = await signed(event());
    expect(await verifyAdmobSsv(q.replace('transaction_id=tx-1', 'transaction_id=tx-2'), keys)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyAdmobSsv(q.replace(`user_id=${USER}`, 'user_id=00000000-0000-0000-0000-000000000000'), keys)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects unsigned, unknown-key and forged-key callbacks', async () => {
    expect(await verifyAdmobSsv(event(), keys)).toEqual({ ok: false, reason: 'malformed' });
    expect(await verifyAdmobSsv(await signed(event(), '999'), keys)).toEqual({ ok: false, reason: 'unknown_key' });
    const other = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.privateKey, new TextEncoder().encode(event())));
    expect(await verifyAdmobSsv(`${event()}&signature=${b64url(rawToDer(sig))}&key_id=1234`, keys)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyAdmobSsv(`${event()}&signature=%%%&key_id=1234`, keys)).toMatchObject({ ok: false });
  });

  it('converts DER signatures with leading zero padding', () => {
    const raw = new Uint8Array(64);
    raw[0] = 0x80;
    raw[33] = 1;
    expect(derToRaw(rawToDer(raw))).toEqual(raw);
    expect(derToRaw(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

describe('SSV endpoint', () => {
  const base = (grant: SsvDeps['grant'], adUnit: string | null = null) => createSsvHandler({ keys: async () => keys, grant, adUnit });
  const req = async (q: string, method = 'GET') => new Request(`https://x.supabase.co/functions/v1/admob-ssv?${q}`, { method });

  it('pays a genuine event once per transaction id (the database decides replays)', async () => {
    const seen = new Set<string>();
    const grant = vi.fn(async (_u: string, tx: string) => {
      const replayed = seen.has(tx);
      seen.add(tx);
      return { ok: true as const, status: 'granted', reason: null, replayed };
    });
    const h = base(grant);
    const q = await signed(event('tx-9'));
    const first = await h(await req(q));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ result: 'granted', reason: null, replayed: false });
    expect(await (await h(await req(q))).json()).toMatchObject({ replayed: true });
    expect(grant).toHaveBeenCalledWith(USER, 'tx-9');
  });

  it('never pays a forged or tampered request', async () => {
    const grant = vi.fn();
    const h = base(grant as never);
    expect((await h(await req(event()))).status).toBe(400);
    expect((await h(await req((await signed(event())).replace('tx-1', 'tx-X')))).status).toBe(403);
    expect((await h(await req(await signed(event()), 'POST'))).status).toBe(405);
    expect(grant).not.toHaveBeenCalled();
  });

  it("answers AdMob's Verify URL test and ignores events without a player or for another ad unit", async () => {
    const grant = vi.fn();
    const h = base(grant as never, '5224354917');
    expect(await (await h(await req(await signed('ad_network=1&ad_unit=1&reward_amount=1&reward_item=x&timestamp=1')))).json()).toEqual({ result: 'verified' });
    expect(await (await h(await req(await signed(event('tx-2', 'not-a-uuid'))))).json()).toMatchObject({ result: 'ignored', reason: 'no_player' });
    expect(await (await h(await req(await signed(event('tx-3', USER, '111'))))).json()).toMatchObject({ result: 'ignored', reason: 'other_ad_unit' });
    expect(grant).not.toHaveBeenCalled();
  });

  it('reports rejections as settled and database outages as retryable', async () => {
    const rejected = base(async () => ({ ok: true, status: 'rejected', reason: 'banned', replayed: false }));
    expect(await (await rejected(await req(await signed(event())))).json()).toMatchObject({ result: 'rejected', reason: 'banned' });
    const missing = base(async () => ({ ok: false, code: 'P0404' }));
    expect((await missing(await req(await signed(event())))).status).toBe(200);
    const down = base(async () => ({ ok: false, code: '503' }));
    expect((await down(await req(await signed(event())))).status).toBe(500);
  });

  it('refreshes Google keys once for an unknown key id', async () => {
    const calls: boolean[] = [];
    const h = createSsvHandler({
      keys: async (refresh) => {
        calls.push(!!refresh);
        return refresh ? keys : new Map();
      },
      grant: async () => ({ ok: true, status: 'granted', reason: null, replayed: false }),
    });
    expect((await h(await req(await signed(event())))).status).toBe(200);
    expect(calls).toEqual([false, true]);
  });
});
