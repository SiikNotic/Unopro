import { describe, expect, it } from 'vitest';
import { handleSlotRequest, StoreError } from '../slotHandler';
import type { Receipt, SlotStore } from '../slotHandler';
import { resolveSpin } from '../../../../src/casino/premium/engine';

/** In-memory twin of the SQL functions: per-player serialisation, idempotent on request id. */
function memoryStore(start = 1000) {
  const wallets = new Map<string, number>();
  const spins = new Map<string, Receipt>();
  let chain = Promise.resolve();
  const locked = <T,>(fn: () => T): Promise<T> => {
    const run = chain.then(fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  const store: SlotStore = {
    commit: (c) =>
      locked(() => {
        const key = `${c.userId}/${c.requestId}`;
        const prev = spins.get(key);
        if (prev) {
          if (prev.machine !== c.machine || prev.bet !== c.bet) throw new StoreError('conflict');
          return prev;
        }
        const bal = wallets.get(c.userId) ?? start;
        if (bal < c.bet) throw new StoreError('insufficient_funds');
        const next = bal - c.bet + c.payout;
        wallets.set(c.userId, next);
        const r: Receipt = { requestId: c.requestId, machine: c.machine, bet: c.bet, stops: c.stops, payout: c.payout, balance: next, at: 1 };
        spins.set(key, r);
        return r;
      }),
    find: async (u, id) => spins.get(`${u}/${id}`) ?? null,
    balance: async (u) => wallets.get(u) ?? start,
  };
  return { store, wallets, spins };
}

const URL_ = 'https://x.test/functions/v1/slot-spin';
const uuid = () => crypto.randomUUID();
const post = (userId: string | null, body: unknown) => ({ method: 'POST', url: URL_, userId, body });

describe('slot server handler', () => {
  it('decides the spin on the server and books it: the payout matches the stops', async () => {
    const m = memoryStore();
    const res = await handleSlotRequest(post('A', { requestId: uuid(), machine: 'inferno', bet: 50 }), { store: m.store });
    expect(res.status).toBe(200);
    const r = res.body as Receipt;
    expect(r.payout).toBe(resolveSpin(r.stops, 50).payout);
    expect(r.balance).toBe(1000 - 50 + r.payout);
    expect(m.wallets.get('A')).toBe(r.balance);
  });

  it('ignores any result, payout or balance the client tries to send', async () => {
    const m = memoryStore();
    const res = await handleSlotRequest(post('A', { requestId: uuid(), machine: 'lucky7s', bet: 10, stops: [5, 5, 5, 5, 5], payout: 25000, balance: 1e9, userId: 'B' }), { store: m.store, random: () => 0 });
    const r = res.body as Receipt;
    expect(r.stops).toEqual([0, 0, 0, 0, 0]);
    expect(m.wallets.has('B')).toBe(false);
    expect(r.payout).toBe(resolveSpin([0, 0, 0, 0, 0], 10).payout);
  });

  it('requires a verified player', async () => {
    const res = await handleSlotRequest(post(null, { requestId: uuid(), machine: 'lucky7s', bet: 10 }), { store: memoryStore().store });
    expect(res).toEqual({ status: 401, body: { code: 'unauthorized' } });
  });

  it('validates input', async () => {
    const { store } = memoryStore();
    const bad = [
      [{ requestId: 'x', machine: 'lucky7s', bet: 10 }, 'invalid_bet'],
      [{ requestId: uuid(), machine: 'nope', bet: 10 }, 'invalid_machine'],
      [{ requestId: uuid(), machine: 'lucky7s', bet: 11 }, 'invalid_bet'],
      [{ requestId: uuid(), machine: 'lucky7s', bet: -10 }, 'invalid_bet'],
      [{ requestId: uuid(), machine: 'lucky7s', bet: '10' }, 'invalid_bet'],
      [null, 'invalid_bet'],
    ] as const;
    for (const [body, code] of bad) expect((await handleSlotRequest(post('A', body), { store })).body).toEqual({ code });
  });

  it('a replayed or concurrently duplicated request is booked once and answered identically', async () => {
    const m = memoryStore();
    const body = { requestId: uuid(), machine: 'cosmic', bet: 100 };
    const answers = await Promise.all(Array.from({ length: 10 }, () => handleSlotRequest(post('A', body), { store: m.store })));
    const first = answers[0].body as Receipt;
    for (const a of answers) expect(a.body).toEqual(first);
    expect(m.spins.size).toBe(1);
    expect(m.wallets.get('A')).toBe(1000 - 100 + first.payout);
  });

  it('never spends chips the player does not have, whatever the concurrency', async () => {
    const m = memoryStore(500);
    // A losing position, so exactly five 100-chip bets fit in 500.
    let losing: number[] = [];
    for (let a = 0; a < 39 && !losing.length; a++) {
      const stops = [a, (a + 7) % 39, (a + 15) % 39, (a + 22) % 39, (a + 30) % 39];
      if (resolveSpin(stops, 100).payout === 0) losing = stops;
    }
    let k = 0;
    const random = () => losing[k++ % 5];
    const answers = await Promise.all(Array.from({ length: 30 }, () => handleSlotRequest(post('A', { requestId: uuid(), machine: 'royal', bet: 100 }), { store: m.store, random })));
    const ok = answers.filter((a) => a.status === 200);
    expect(ok.length).toBe(5);
    expect(answers.filter((a) => a.status === 402).length).toBe(25);
    expect(m.wallets.get('A')).toBe(0);
  });

  it('refuses reusing a request id for another bet (409)', async () => {
    const m = memoryStore();
    const id = uuid();
    await handleSlotRequest(post('A', { requestId: id, machine: 'cosmic', bet: 100 }), { store: m.store });
    expect((await handleSlotRequest(post('A', { requestId: id, machine: 'cosmic', bet: 200 }), { store: m.store })).status).toBe(409);
  });

  it('lookup only returns the calling player’s spins (no IDOR)', async () => {
    const m = memoryStore();
    const id = uuid();
    await handleSlotRequest(post('A', { requestId: id, machine: 'pirates', bet: 10 }), { store: m.store });
    const mine = await handleSlotRequest({ method: 'GET', url: `${URL_}?requestId=${id}`, userId: 'A', body: null }, { store: m.store });
    const theirs = await handleSlotRequest({ method: 'GET', url: `${URL_}?requestId=${id}`, userId: 'B', body: null }, { store: m.store });
    expect(mine.status).toBe(200);
    expect(theirs).toEqual({ status: 404, body: { found: false } });
  });

  it('rate limits and hides internal errors', async () => {
    const { store } = memoryStore();
    expect((await handleSlotRequest(post('A', { requestId: uuid(), machine: 'lucky7s', bet: 10 }), { store, allow: () => false })).status).toBe(429);
    const broken: SlotStore = { ...store, commit: async () => { throw new Error('db exploded: password=...'); } };
    expect(await handleSlotRequest(post('A', { requestId: uuid(), machine: 'lucky7s', bet: 10 }), { store: broken })).toEqual({ status: 500, body: { code: 'server' } });
  });
});
