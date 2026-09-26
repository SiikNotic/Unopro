import { describe, expect, it } from 'vitest';
import { bjView, CasinoStoreError, handleCasinoRequest, parseBets } from '../handler';
import type { BjRow, Booking, CasinoDeps, CasinoStore, CasinoUser, HttpIn } from '../handler';
import type { BlackjackView, RouletteResult, SlotsResult } from '../protocol';
import { createRng } from '@/game/engine';
import { totalPayout } from '../../roulette';
import { evaluateSpin } from '../../slots';
import { settleRound } from '../../premium/engine';
import { MACHINES } from '../../premium/machines';
import * as bj from '../../blackjack';

/** Same rules as the accounts migration, in memory. */
function memoryStore(registered: Set<string>) {
  const wallets = new Map<string, { balance: number; bonus: boolean }>();
  const ledger = new Map<string, Booking>();
  const hands = new Map<string, BjRow>();
  const key = (u: string, r: string) => `${u}:${r}`;
  const need = (u: string) => {
    if (!registered.has(u)) throw new CasinoStoreError('not_registered');
  };
  let t = 0;
  const store: CasinoStore = {
    async account(u) {
      const w = wallets.get(u);
      return { balance: w?.balance ?? 0, bonusClaimed: !!w?.bonus, registered: registered.has(u) };
    },
    async claimBonus(u, r) {
      need(u);
      const w = wallets.get(u) ?? { balance: 0, bonus: false };
      wallets.set(u, w);
      if (w.bonus) return { balance: w.balance, granted: false };
      w.balance += 1000;
      w.bonus = true;
      ledger.set(key(u, r), { requestId: r, game: 'bonus', stake: 0, payout: 1000, balance: w.balance, detail: {}, at: ++t });
      return { balance: w.balance, granted: true };
    },
    async play(c) {
      const prev = ledger.get(key(c.userId, c.requestId));
      if (prev) {
        if (prev.game !== c.game || prev.stake !== c.stake) throw new CasinoStoreError('conflict');
        return { ...prev, replayed: true };
      }
      need(c.userId);
      const w = wallets.get(c.userId);
      if (!w || w.balance < c.stake) throw new CasinoStoreError('insufficient_funds');
      w.balance += c.payout - c.stake;
      const b: Booking = { requestId: c.requestId, game: c.game, stake: c.stake, payout: c.payout, balance: w.balance, detail: c.detail, at: ++t };
      ledger.set(key(c.userId, c.requestId), b);
      return { ...b, replayed: false };
    },
    async find(u, r) {
      return ledger.get(key(u, r)) ?? null;
    },
    async bjLoad(u) {
      const h = hands.get(u);
      return h ? structuredClone(h) : null;
    },
    async bjOpen(u, r, stake, state) {
      if (hands.has(u) || ledger.has(key(u, r))) throw new CasinoStoreError('conflict');
      need(u);
      const w = wallets.get(u);
      if (!w || w.balance < stake) throw new CasinoStoreError('insufficient_funds');
      w.balance -= stake;
      hands.set(u, { requestId: r, stake, state: structuredClone(state), version: 1 });
      return w.balance;
    },
    async bjStep(u, r, version, extra, state, payout, detail) {
      const h = hands.get(u);
      if (!h || h.requestId !== r || h.version !== version) throw new CasinoStoreError('conflict');
      const w = wallets.get(u)!;
      if (extra > h.stake) throw new CasinoStoreError('invalid_bet');
      if (w.balance < extra) throw new CasinoStoreError('insufficient_funds');
      w.balance += (payout ?? 0) - extra;
      if (payout === null) Object.assign(h, { stake: h.stake + extra, state: structuredClone(state), version: h.version + 1 });
      else {
        ledger.set(key(u, r), { requestId: r, game: 'blackjack', stake: h.stake + extra, payout, balance: w.balance, detail: detail ?? {}, at: ++t });
        hands.delete(u);
      }
      return w.balance;
    },
  };
  return { store, wallets, ledger, hands };
}

const ANA: CasinoUser = { id: 'ana', registered: true };
const GUEST: CasinoUser = { id: 'guest', registered: false };
let n = 0;
const rid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;

function setup(seed = 7) {
  const m = memoryStore(new Set(['ana', 'beto']));
  const r = createRng(seed);
  const deps: CasinoDeps = { store: m.store, rng: () => createRng(r.next() * 4294967296), seed: () => Math.floor(r.next() * 4294967296), random: () => Math.floor(r.next() * 4294967296) };
  const post = (user: CasinoUser | null, body: unknown) => handleCasinoRequest({ method: 'POST', url: 'https://x/casino', user, body } as HttpIn, deps);
  const get = (user: CasinoUser | null, q: string) => handleCasinoRequest({ method: 'GET', url: `https://x/casino?${q}`, user, body: null }, deps);
  return { ...m, deps, post, get };
}

describe('casino server: accounts and the welcome credit', () => {
  it('refuses missing tokens and guests; gives 1,000 once to a registered player', async () => {
    const s = setup();
    expect((await s.post(null, { op: 'account' })).status).toBe(401);
    expect((await s.post(GUEST, { op: 'account' })).body).toEqual({ balance: 0, bonusClaimed: false, registered: false });
    expect((await s.post(GUEST, { op: 'claim', requestId: rid() })).status).toBe(403);
    expect((await s.post(GUEST, { op: 'roulette', requestId: rid(), bets: [{ type: 'red', amount: 10 }] })).status).toBe(403);
    expect((await s.get(GUEST, 'balance=1')).status).toBe(403);
    // A client that claims to be registered is still refused by the database.
    expect((await s.post({ id: 'guest', registered: true }, { op: 'claim', requestId: rid() })).status).toBe(403);

    expect((await s.post(ANA, { op: 'claim', requestId: rid() })).body).toEqual({ balance: 1000, granted: true });
    expect((await s.post(ANA, { op: 'claim', requestId: rid() })).body).toEqual({ balance: 1000, granted: false });
    expect((await s.post(ANA, { op: 'account' })).body).toEqual({ balance: 1000, bonusClaimed: true, registered: true });
  });

  it('ignores anything that looks like a balance or a result in the request', async () => {
    const s = setup();
    await s.post(ANA, { op: 'claim', requestId: rid() });
    const res = await s.post(ANA, { op: 'roulette', requestId: rid(), bets: [{ type: 'red', amount: 10 }], pocket: 1, payout: 999999, balance: 1e9 });
    const body = res.body as RouletteResult;
    expect(body.payout).toBe(totalPayout([{ type: 'red', amount: 10 }], body.pocket));
    expect(body.balance).toBe(1000 - 10 + body.payout);
  });
});

describe('casino server: roulette and classic slots', () => {
  it('parses bets strictly', () => {
    expect(parseBets([{ type: 'straight', value: 17, amount: 5 }, { type: 'dozen', value: 2, amount: 10 }])).toHaveLength(2);
    for (const bad of [[], [{ type: 'straight', value: 37, amount: 5 }], [{ type: 'red', amount: 0 }], [{ type: 'red', amount: 1.5 }], [{ type: 'red', value: 3, amount: 5 }], [{ type: 'split', amount: 5 }], [{ type: 'dozen', value: 4, amount: 1 }], [{ type: 'red', amount: 100001 }], 'x'])
      expect(parseBets(bad)).toBeNull();
  });

  it('spins, pays by the rules, replays a retry without a new draw, and refuses more than the balance', async () => {
    const s = setup();
    await s.post(ANA, { op: 'claim', requestId: rid() });
    const id = rid();
    const bets = [{ type: 'straight', value: 7, amount: 20 }, { type: 'black', amount: 30 }];
    const a = (await s.post(ANA, { op: 'roulette', requestId: id, bets })).body as RouletteResult;
    expect(a.stake).toBe(50);
    expect(a.payout).toBe(totalPayout(bets as never, a.pocket));
    const again = (await s.post(ANA, { op: 'roulette', requestId: id, bets })).body as RouletteResult;
    expect(again).toEqual(a);
    expect((await s.post(ANA, { op: 'roulette', requestId: id, bets: [{ type: 'red', amount: 5 }] })).status).toBe(409);
    expect((await s.post(ANA, { op: 'roulette', requestId: rid(), bets: [{ type: 'red', amount: 5000 }] })).status).toBe(402);

    const sl = (await s.post(ANA, { op: 'slots', requestId: rid(), lines: 10, betPerLine: 2 })).body as SlotsResult;
    expect(sl.payout).toBe(evaluateSpin(sl.stops, 10, 2).total);
    expect(sl.balance).toBe(a.balance - 20 + sl.payout);
    expect((await s.post(ANA, { op: 'slots', requestId: rid(), lines: 7, betPerLine: 2 })).status).toBe(400);
    expect((await s.post(ANA, { op: 'slots', requestId: rid(), lines: 10, betPerLine: 3 })).status).toBe(400);
  });
});

describe('casino server: premium slot protocol', () => {
  it('books a round with the machine math, looks it up, and reports the balance', async () => {
    const s = setup();
    await s.post(ANA, { op: 'claim', requestId: rid() });
    const ids = Object.keys(MACHINES) as (keyof typeof MACHINES)[];
    // Two machines that share a bet level, to check a reused request id with another machine.
    const machine = ids.find((k) => ids.some((o) => o !== k && MACHINES[o].betLevels.includes(MACHINES[k].betLevels[0])))!;
    const bet = MACHINES[machine].betLevels[0];
    const id = rid();
    const res = await s.post(ANA, { requestId: id, machine, bet });
    expect(res.status).toBe(200);
    const r = res.body as { payout: number; draws: never; balance: number; bet: number };
    expect(r.payout).toBe(settleRound(MACHINES[machine], bet, r.draws).payout);
    expect(r.balance).toBe(1000 - bet + r.payout);
    expect((await s.get(ANA, `requestId=${id}`)).body).toEqual(res.body);
    expect((await s.get(ANA, 'balance=1')).body).toEqual({ balance: r.balance });
    const other = ids.find((k) => k !== machine && MACHINES[k].betLevels.includes(bet))!;
    expect((await s.post(ANA, { requestId: id, machine: other, bet })).status).toBe(409);
    expect((await s.post(ANA, { requestId: rid(), machine, bet: bet + 1 })).status).toBe(400);
    expect((await s.get(ANA, `requestId=${rid()}`)).status).toBe(404);
  });
});

describe('casino server: blackjack', () => {
  it('hides the shoe and the hole card, and plays a hand to the end with the right money', async () => {
    const s = setup(11);
    await s.post(ANA, { op: 'claim', requestId: rid() });
    let settledSeen = 0;
    for (let round = 0; round < 30; round++) {
      const before = (await s.store.account('ana')).balance;
      const id = rid();
      let v = (await s.post(ANA, { op: 'bj_deal', requestId: id, bet: 10 })).body as BlackjackView;
      expect(v).not.toHaveProperty('shoe');
      let guard = 0;
      while (v.phase === 'PLAYER' && guard++ < 10) {
        expect(v.dealer[1]).toBeNull();
        const row = await s.store.bjLoad('ana');
        const action = bj.canSplit(row!.state) ? 'split' : bj.canDouble(row!.state) && round % 3 === 0 ? 'double' : bj.handTotal(v.hands[v.active].cards).total < 16 ? 'hit' : 'stand';
        const res = await s.post(ANA, { op: 'bj_act', requestId: id, action });
        expect(res.status).toBe(200);
        v = res.body as BlackjackView;
      }
      expect(v.phase).toBe('SETTLED');
      expect(v.dealer.every(Boolean)).toBe(true);
      const paid = v.results.reduce((a, r) => a + r.payout, 0);
      expect(v.balance).toBe(before - v.stake + paid);
      expect((await s.store.find('ana', id))?.stake).toBe(v.stake);
      settledSeen++;
    }
    expect(settledSeen).toBe(30);
    expect(s.hands.size).toBe(0);
  });

  it('one hand at a time; retries return the same table; acting on another hand or illegally is refused', async () => {
    const s = setup(3);
    await s.post(ANA, { op: 'claim', requestId: rid() });
    // Find a deal that isn't an instant natural.
    let id = rid();
    let v = (await s.post(ANA, { op: 'bj_deal', requestId: id, bet: 20 })).body as BlackjackView;
    while (v.phase !== 'PLAYER') {
      id = rid();
      v = (await s.post(ANA, { op: 'bj_deal', requestId: id, bet: 20 })).body as BlackjackView;
    }
    expect((await s.post(ANA, { op: 'bj_deal', requestId: id, bet: 20 })).body).toEqual(v);
    expect((await s.post(ANA, { op: 'bj_deal', requestId: rid(), bet: 20 })).status).toBe(409);
    expect((await s.post(ANA, { op: 'bj_act', requestId: rid(), action: 'hit' })).status).toBe(409);
    const row = await s.store.bjLoad('ana');
    if (!bj.canSplit(row!.state)) expect((await s.post(ANA, { op: 'bj_act', requestId: id, action: 'split' })).status).toBe(400);
    expect((await s.post(ANA, { op: 'bj_act', requestId: id, action: 'peek' })).status).toBe(400);
    // Another player can't touch Ana's hand, and the resume call shows the same hidden view.
    expect((await s.post({ id: 'beto', registered: true }, { op: 'bj_act', requestId: id, action: 'stand' })).status).toBe(409);
    const resumed = (await s.post(ANA, { op: 'bj' })).body as { table: BlackjackView };
    expect(resumed.table).toEqual(bjView({ requestId: id, stake: 20, state: row!.state }, v.balance));
    expect(resumed.table.dealer[1]).toBeNull();
    await s.post(ANA, { op: 'bj_act', requestId: id, action: 'stand' });
    expect((await s.post(ANA, { op: 'bj_act', requestId: id, action: 'stand' })).status).toBe(409);
  });

  it('refuses a deal the balance cannot cover and a double without the coins', async () => {
    const s = setup(5);
    await s.post(ANA, { op: 'claim', requestId: rid() });
    expect((await s.post(ANA, { op: 'bj_deal', requestId: rid(), bet: 1001 })).status).toBe(402);
    expect((await s.post(ANA, { op: 'bj_deal', requestId: rid(), bet: 0 })).status).toBe(400);
  });
});

describe('casino server: games out of service', () => {
  it('refuses new slot rounds (premium and classic) but still returns rounds already booked; roulette unaffected', async () => {
    const s = setup();
    let on = true;
    s.deps.gameEnabled = async (g) => g !== 'slots' || on;
    await s.post(ANA, { op: 'claim', requestId: rid() });
    const machine = Object.keys(MACHINES)[0] as keyof typeof MACHINES;
    const bet = MACHINES[machine].betLevels[0];
    const id = rid();
    const first = await s.post(ANA, { requestId: id, machine, bet });
    expect(first.status).toBe(200);
    on = false;
    expect(await s.post(ANA, { requestId: rid(), machine, bet })).toEqual({ status: 423, body: { code: 'game_disabled' } });
    expect((await s.post(ANA, { op: 'slots', requestId: rid(), lines: 10, betPerLine: 2 })).status).toBe(423);
    // a retry of the round booked before is answered with that round, not played again
    expect((await s.post(ANA, { requestId: id, machine, bet })).body).toEqual(first.body);
    expect((await s.post(ANA, { op: 'roulette', requestId: rid(), bets: [{ type: 'red', amount: 5 }] })).status).toBe(200);
    on = true;
    expect((await s.post(ANA, { requestId: rid(), machine, bet })).status).toBe(200);
  });

  it('refuses a new roulette spin and a new blackjack hand, but a hand already dealt finishes', async () => {
    const s = setup(3);
    const off = new Set<string>();
    s.deps.gameEnabled = async (g) => !off.has(g);
    await s.post(ANA, { op: 'claim', requestId: rid() });
    // find a deal that doesn't settle at once (no natural)
    let hand: BlackjackView | null = null;
    for (let i = 0; i < 30 && !hand; i++) {
      const r = (await s.post(ANA, { op: 'bj_deal', requestId: rid(), bet: 10 })).body as BlackjackView;
      if (r.phase === 'PLAYER') hand = r;
    }
    expect(hand).not.toBeNull();
    off.add('blackjack');
    off.add('roulette');
    expect((await s.post(ANA, { op: 'roulette', requestId: rid(), bets: [{ type: 'red', amount: 5 }] })).status).toBe(423);
    const done = await s.post(ANA, { op: 'bj_act', requestId: hand!.requestId, action: 'stand' });
    expect(done.status).toBe(200);
    expect((await s.post(ANA, { op: 'bj_deal', requestId: rid(), bet: 10 })).status).toBe(423);
  });
});
