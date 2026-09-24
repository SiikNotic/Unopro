import { describe, expect, it, vi } from 'vitest';
import { BET_LEVELS, drawStops, isValidBet, MACHINE_IDS, resolveSpin, tierFor } from '../engine';
import { createLocalSlotService, readReceipts } from '../localHouse';
import { createRemoteSlotService } from '../remoteHouse';
import { newRequestId, parseReceipt, SpinError, spinWithRecovery } from '../service';
import type { SlotService, SpinReceipt, SpinRequest } from '../service';
import { emptyWallet, playRound } from '../../ledger';
import type { WalletData } from '../../ledger';
import { REEL, returnToPlayer } from '../../slots';

/** A wallet + receipt store in memory, wired exactly like WalletProvider wires the real one. */
function fakeHouse(balance = 1000, random?: () => number) {
  let wallet: WalletData = emptyWallet(balance);
  let stored: unknown = null;
  const store = { get: () => stored, set: (v: SpinReceipt[]) => ((stored = JSON.parse(JSON.stringify(v))), true) };
  const service = createLocalSlotService({
    book: (id, game, stake, payout, journal) => {
      const r = playRound(wallet, { id, game, stake, payout, now: 1 });
      if (!r.ok) return { ok: false, reason: r.reason };
      journal?.(r.wallet.balance);
      wallet = r.wallet;
      return { ok: true, balance: wallet.balance };
    },
    wasSettled: (id) => wallet.paid.includes(id),
    getBalance: () => wallet.balance,
    store,
    random,
  });
  return { service, get wallet() { return wallet; }, set wallet(w: WalletData) { wallet = w; }, store, get stored() { return stored; }, set stored(v: unknown) { stored = v; } };
}

const req = (over: Partial<SpinRequest> = {}): SpinRequest => ({ requestId: newRequestId(), machine: 'lucky7s', bet: 10, ...over });

describe('premium slot engine', () => {
  it('only accepts the listed bet levels', () => {
    for (const b of BET_LEVELS) expect(isValidBet(b)).toBe(true);
    for (const b of [0, -10, 5, 15, 10.5, NaN, Infinity, '10', null, 2000]) expect(isValidBet(b)).toBe(false);
  });

  it('pays whole chips: the bet splits evenly across the 10 lines', () => {
    for (let i = 0; i < 2000; i++) {
      const stops = drawStops(() => Math.floor(Math.random() * 2 ** 32));
      for (const bet of BET_LEVELS) expect(Number.isInteger(resolveSpin(stops, bet).payout)).toBe(true);
    }
  });

  it('draws uniform stops in range and rejects the biased top of the uint32 range', () => {
    const counts = new Array(REEL.length).fill(0);
    let x = 0;
    const seq = () => (x = (x + 2654435761) >>> 0);
    for (let i = 0; i < 39000; i++) for (const s of drawStops(seq)) counts[s]++;
    for (const c of counts) expect(Math.abs(c - 5000)).toBeLessThan(500);
    // values at/above the largest multiple of 39 are re-drawn, never folded back in
    const values = [0xffffffff, 0xfffffffe, 5, 6, 7, 8, 9];
    expect(drawStops(() => values.shift()!)).toEqual([5, 6, 7, 8, 9]);
  });

  it('keeps the audited return (~94.9%) for every machine', () => {
    expect(returnToPlayer()).toBeGreaterThan(0.94);
    expect(returnToPlayer()).toBeLessThan(0.96);
    expect(MACHINE_IDS).toHaveLength(8);
  });

  it('never celebrates getting part of the stake back', () => {
    expect(tierFor(0, 100, false)).toBe('none');
    expect(tierFor(40, 100, false)).toBe('tiny');
    expect(tierFor(100, 100, false)).toBe('tiny');
    expect(tierFor(101, 100, false)).toBe('small');
    expect(tierFor(1000, 100, false)).toBe('big');
    expect(tierFor(4000, 100, false)).toBe('mega');
    expect(tierFor(25000, 100, true)).toBe('jackpot');
  });

  it('five sevens on a line is the jackpot', () => {
    const seven = REEL.indexOf('seven');
    const r = resolveSpin([seven, seven, seven, seven, seven], 10);
    expect(r.tier).toBe('jackpot');
    expect(r.payout).toBeGreaterThanOrEqual(2500);
  });
});

describe('receipt validation', () => {
  const good = (): SpinReceipt => {
    const stops = [0, 1, 2, 3, 4];
    return { requestId: newRequestId(), machine: 'inferno', bet: 20, stops, payout: resolveSpin(stops, 20).payout, balance: 500, at: 1 };
  };
  it('accepts a consistent receipt', () => {
    const r = good();
    expect(parseReceipt(r, { requestId: r.requestId, machine: 'inferno', bet: 20 })).toEqual(r);
  });
  it.each([
    ['missing stops', (r: SpinReceipt) => ({ ...r, stops: undefined })],
    ['four reels', (r: SpinReceipt) => ({ ...r, stops: [1, 2, 3, 4] })],
    ['stop out of range', (r: SpinReceipt) => ({ ...r, stops: [1, 2, 3, 4, 39] })],
    ['payout not matching the stops', (r: SpinReceipt) => ({ ...r, payout: r.payout + 10 })],
    ['negative balance', (r: SpinReceipt) => ({ ...r, balance: -1 })],
    ['fractional balance', (r: SpinReceipt) => ({ ...r, balance: 1.5 })],
    ['unknown machine', (r: SpinReceipt) => ({ ...r, machine: 'hack' })],
    ['off-list bet', (r: SpinReceipt) => ({ ...r, bet: 15 })],
    ['not an object', () => 'ok'],
    ['null', () => null],
  ])('rejects %s', (_, mutate) => {
    expect(() => parseReceipt(mutate(good()))).toThrow(SpinError);
  });
  it('rejects a receipt for a different request', () => {
    const r = good();
    expect(() => parseReceipt(r, { requestId: newRequestId(), machine: 'inferno', bet: 20 })).toThrow(/another request/);
    expect(() => parseReceipt(r, { requestId: r.requestId, machine: 'inferno', bet: 50 })).toThrow(/another request/);
  });
});

describe('local house', () => {
  it('books stake and payout atomically and the balance matches the receipt', async () => {
    const h = fakeHouse(1000);
    for (let i = 0; i < 300; i++) {
      const before = h.wallet.balance;
      if (before < 10) break;
      const r = await h.service.spin(req());
      expect(r.balance).toBe(before - 10 + r.payout);
      expect(h.wallet.balance).toBe(r.balance);
      expect(r.payout).toBe(resolveSpin(r.stops, 10).payout);
    }
    expect(h.wallet.open).toHaveLength(0);
  });

  it('a replayed request returns the same receipt and charges/pays nothing again', async () => {
    const h = fakeHouse(1000);
    const q = req({ bet: 100 });
    const first = await h.service.spin(q);
    const balance = h.wallet.balance;
    const again = await Promise.all([h.service.spin(q), h.service.spin(q), h.service.spin({ ...q, requestId: q.requestId.toUpperCase() })]);
    for (const r of again) expect(r).toEqual(first);
    expect(h.wallet.balance).toBe(balance);
    expect(h.wallet.stats.rounds).toBe(1);
  });

  it('refuses reusing a request id for another bet or machine', async () => {
    const h = fakeHouse(1000);
    const q = req();
    await h.service.spin(q);
    await expect(h.service.spin({ ...q, bet: 20 })).rejects.toMatchObject({ code: 'conflict' });
    await expect(h.service.spin({ ...q, machine: 'cosmic' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses unaffordable, invalid and malformed bets without touching the wallet', async () => {
    const h = fakeHouse(15);
    await expect(h.service.spin(req({ bet: 20 }))).rejects.toMatchObject({ code: 'insufficient_funds' });
    await expect(h.service.spin(req({ bet: -10 }))).rejects.toMatchObject({ code: 'invalid_bet' });
    await expect(h.service.spin(req({ bet: 10.5 }))).rejects.toMatchObject({ code: 'invalid_bet' });
    await expect(h.service.spin(req({ bet: 0 }))).rejects.toMatchObject({ code: 'invalid_bet' });
    await expect(h.service.spin(req({ machine: 'x' as never }))).rejects.toMatchObject({ code: 'invalid_machine' });
    await expect(h.service.spin(req({ requestId: 'not-a-uuid' }))).rejects.toMatchObject({ code: 'invalid_bet' });
    expect(h.wallet.balance).toBe(15);
    expect(h.stored).toBeNull();
  });

  it('never lets the balance go negative, however many spins race', async () => {
    const h = fakeHouse(50);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => h.service.spin(req({ bet: 50 }))));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(h.wallet.balance).toBeGreaterThanOrEqual(0);
    const paid = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    expect(h.wallet.balance).toBe(50 - 50 * paid.length + paid.reduce((s, r) => s + r.payout, 0));
  });

  it('lookup finds booked spins only; an edited receipt store cannot invent one', async () => {
    const h = fakeHouse(1000);
    const q = req();
    const r = await h.service.spin(q);
    expect(await h.service.lookup(q.requestId)).toEqual(r);
    expect(await h.service.lookup(newRequestId())).toBeNull();
    // A forged receipt that the wallet never booked is ignored.
    const forged = { ...r, requestId: newRequestId() };
    h.stored = [forged, ...(h.stored as SpinReceipt[])];
    expect(await h.service.lookup(forged.requestId)).toBeNull();
    // An edited payout that no longer matches the stops is dropped.
    h.stored = [{ ...r, payout: r.payout + 1000 }];
    expect(readReceipts(h.store)).toHaveLength(0);
  });

  it('a request id the wallet booked but whose receipt was lost is not booked again', async () => {
    const h = fakeHouse(1000);
    const q = req();
    await h.service.spin(q);
    h.stored = null;
    await expect(h.service.spin(q)).rejects.toMatchObject({ code: 'conflict' });
    expect(h.wallet.stats.rounds).toBe(1);
  });
});

describe('spinWithRecovery', () => {
  const receiptFor = (q: SpinRequest): SpinReceipt => {
    const stops = [3, 3, 3, 3, 3];
    return { ...q, stops, payout: resolveSpin(stops, q.bet).payout, balance: 990, at: 1 };
  };
  const quick = { backoffMs: () => 1 };

  it('recovers a spin whose answer was lost instead of spinning again', async () => {
    const q = req();
    const booked = receiptFor(q);
    const service: SlotService = {
      mode: 'remote',
      spin: vi.fn().mockRejectedValueOnce(new SpinError('timeout')),
      lookup: vi.fn().mockResolvedValue(booked),
      balance: vi.fn(),
    };
    await expect(spinWithRecovery(service, q, quick)).resolves.toEqual(booked);
    expect(service.spin).toHaveBeenCalledTimes(1);
  });

  it('retries with the same request id when the house never got it', async () => {
    const q = req();
    const spin = vi.fn().mockRejectedValueOnce(new SpinError('network')).mockResolvedValueOnce(receiptFor(q));
    const service: SlotService = { mode: 'remote', spin, lookup: vi.fn().mockResolvedValue(null), balance: vi.fn() };
    await spinWithRecovery(service, q, quick);
    expect(spin).toHaveBeenCalledTimes(2);
    expect(spin.mock.calls[0][0].requestId).toBe(q.requestId);
    expect(spin.mock.calls[1][0].requestId).toBe(q.requestId);
  });

  it('throws definite refusals at once, without retrying', async () => {
    const spin = vi.fn().mockRejectedValue(new SpinError('insufficient_funds'));
    const service: SlotService = { mode: 'remote', spin, lookup: vi.fn(), balance: vi.fn() };
    await expect(spinWithRecovery(service, req(), quick)).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(spin).toHaveBeenCalledTimes(1);
  });

  it('gives up with an uncertain error after the last try (never a made-up result)', async () => {
    const service: SlotService = { mode: 'remote', spin: vi.fn().mockRejectedValue(new SpinError('server')), lookup: vi.fn().mockResolvedValue(null), balance: vi.fn() };
    const err = await spinWithRecovery(service, req(), { ...quick, attempts: 3 }).catch((e) => e);
    expect(err).toBeInstanceOf(SpinError);
    expect(err.uncertain).toBe(true);
    expect(service.spin).toHaveBeenCalledTimes(3);
  });

  it('rejects an incomplete answer and recovers the real one', async () => {
    const q = req();
    const service: SlotService = {
      mode: 'remote',
      spin: vi.fn().mockResolvedValueOnce({ requestId: q.requestId, stops: [1, 2] }),
      lookup: vi.fn().mockResolvedValue(receiptFor(q)),
      balance: vi.fn(),
    };
    await expect(spinWithRecovery(service, q, quick)).resolves.toEqual(receiptFor(q));
  });
});

describe('remote house', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('sends only request id, machine and bet, with the bearer token', async () => {
    const q = req();
    const stops = [0, 0, 0, 0, 0];
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ...q, stops, payout: resolveSpin(stops, 10).payout, balance: 5, at: 1 }));
    const s = createRemoteSlotService({ url: 'https://api.test/spin', getToken: async () => 'tok', fetchImpl });
    await s.spin(q);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.test/spin');
    expect(JSON.parse(init.body)).toEqual({ requestId: q.requestId, machine: q.machine, bet: q.bet });
    expect(init.headers.authorization).toBe('Bearer tok');
  });

  it.each([
    [402, { code: 'insufficient_funds' }, 'insufficient_funds'],
    [409, {}, 'conflict'],
    [401, {}, 'unauthorized'],
    [429, {}, 'rate_limited'],
    [500, {}, 'server'],
    [503, 'oops', 'server'],
  ])('maps HTTP %s to %s', async (status, body, code) => {
    const s = createRemoteSlotService({ url: 'https://api.test/spin', getToken: async () => 't', fetchImpl: vi.fn().mockResolvedValue(json(status, body)) });
    await expect(s.spin(req())).rejects.toMatchObject({ code });
  });

  it('times out a hung request', async () => {
    const fetchImpl = vi.fn((_: unknown, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))));
    const s = createRemoteSlotService({ url: 'https://api.test/spin', getToken: async () => 't', fetchImpl: fetchImpl as never, timeoutMs: 20 });
    await expect(s.spin(req())).rejects.toMatchObject({ code: 'timeout' });
  });

  it('treats a dropped connection and garbage JSON as uncertain', async () => {
    const s1 = createRemoteSlotService({ url: 'https://x', getToken: async () => 't', fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    await expect(s1.spin(req())).rejects.toMatchObject({ code: 'network' });
    const s2 = createRemoteSlotService({ url: 'https://x', getToken: async () => 't', fetchImpl: vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })) });
    await expect(s2.spin(req())).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('refuses to call without a signed-in player', async () => {
    const fetchImpl = vi.fn();
    const s = createRemoteSlotService({ url: 'https://x', getToken: async () => null, fetchImpl });
    await expect(s.spin(req())).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lookup: 404 means not booked', async () => {
    const s = createRemoteSlotService({ url: 'https://x', getToken: async () => 't', fetchImpl: vi.fn().mockResolvedValue(json(404, { found: false })) });
    await expect(s.lookup(newRequestId())).resolves.toBeNull();
  });
});
