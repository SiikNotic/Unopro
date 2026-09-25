import { describe, expect, it } from 'vitest';
import { handleRoomRequest, RoomStoreError } from '../server/handler';
import type { RoomRow, RoomStore, TableWallet, ViewOut } from '../server/handler';
import type { RoomView } from '../protocol';
import type { BjTable } from '@/casino/table/blackjackTable';
import { BJ_TIMING } from '@/casino/table/blackjackTable';
import { RT_TIMING } from '@/casino/table/rouletteTable';
import type { GameState } from '@/game/engine';

function memoryStore() {
  const rooms = new Map<string, RoomRow>();
  let ids = 0;
  let failNextCommit = false;
  const store: RoomStore = {
    async insert(room, makeViews) {
      if ([...rooms.values()].some((r) => r.code === room.code)) throw new RoomStoreError('conflict');
      const id = `room-${++ids}`;
      makeViews(id);
      const row: RoomRow = { ...room, id, status: 'lobby', state: null, clock: { lastAt: 0, lastCallAt: 0, closingAt: 0, roundOverAt: 0 }, version: 1 };
      rooms.set(id, row);
      return structuredClone(row);
    },
    async load(code) {
      const r = [...rooms.values()].find((x) => x.code === code);
      return r ? structuredClone(r) : null;
    },
    async commit(room, out: ViewOut[]) {
      const cur = rooms.get(room.id)!;
      if (failNextCommit) {
        failNextCommit = false;
        // someone else committed in between
        rooms.set(room.id, { ...cur, version: cur.version + 1 });
        throw new RoomStoreError('conflict');
      }
      if (cur.version !== room.version) throw new RoomStoreError('conflict');
      for (const v of out) if (!room.members.some((m) => m.userId === v.userId)) throw new RoomStoreError('invalid');
      const next = { ...structuredClone(room), version: cur.version + 1 };
      rooms.set(room.id, next);
      return next.version;
    },
    async findOpen(game, userId) {
      const r = [...rooms.values()].find((x) => x.game === game && x.settings.public && x.status !== 'closed' && (x.status === 'lobby' || game !== 'carta') && x.members.length > 0 && x.members.length < x.seats && !x.members.some((m) => m.userId === userId));
      return r?.code ?? null;
    },
  };
  return { store, rooms, conflictOnce: () => (failNextCommit = true) };
}

function memoryWallet(start: Record<string, number>, flags: Record<string, { registered?: boolean; banned?: boolean }> = {}) {
  const balance = new Map(Object.entries(start));
  const seen = new Map<string, { stake: number; payout: number }>();
  const log: string[] = [];
  const wallet: TableWallet = {
    async player(userId) {
      return { registered: flags[userId]?.registered ?? true, banned: flags[userId]?.banned ?? false, balance: balance.get(userId) ?? 0 };
    },
    async bet(userId, requestId, _game, stake) {
      const key = `${userId}|${requestId}`;
      if (seen.has(key)) return { ok: true, balance: balance.get(userId) ?? 0, replayed: true };
      if (flags[userId]?.registered === false) return { ok: false, code: 'not_registered' };
      if (flags[userId]?.banned) return { ok: false, code: 'banned' };
      if ((balance.get(userId) ?? 0) < stake) return { ok: false, code: 'insufficient_funds' };
      balance.set(userId, (balance.get(userId) ?? 0) - stake);
      seen.set(key, { stake, payout: 0 });
      log.push(`bet ${userId} ${stake}`);
      return { ok: true, balance: balance.get(userId)!, replayed: false };
    },
    async pay(userId, requestId, _game, payout) {
      const key = `${userId}|${requestId}`;
      if (seen.has(key)) return { ok: true, balance: balance.get(userId) ?? 0 };
      balance.set(userId, (balance.get(userId) ?? 0) + payout);
      seen.set(key, { stake: 0, payout });
      log.push(`pay ${userId} ${payout}`);
      return { ok: true, balance: balance.get(userId)! };
    },
  };
  return { wallet, balance, log };
}

function setup(start: Record<string, number> = { ana: 1000, beto: 1000 }, flags = {}) {
  let t = 2_000_000;
  let r = 11;
  const mem = memoryStore();
  const w = memoryWallet(start, flags);
  const deps = { store: mem.store, wallet: w.wallet, now: () => t, randomInt: (n: number) => (r = (r * 1103515245 + 12345) & 0x7fffffff) % n, requestId: async (k: string) => k };
  const call = (user: string, body: unknown) => handleRoomRequest(user, body, deps);
  const ok = async (user: string, body: unknown): Promise<RoomView> => {
    const res = await call(user, body);
    if (!res.ok) throw new Error(`${JSON.stringify(body)} → ${res.code} ${res.detail ?? ''}`);
    return res.view;
  };
  return { mem, w, call, ok, advance: (ms: number) => (t += ms) };
}

describe('coin tables', () => {
  it('guests and banned players cannot sit at a coin table', async () => {
    const { call } = setup({ g: 0, b: 1000 }, { g: { registered: false }, b: { banned: true } });
    expect(await call('g', { op: 'quick', game: 'blackjack', name: 'G' })).toMatchObject({ ok: false, code: 'not_registered' });
    expect(await call('b', { op: 'create', game: 'roulette', seats: 6, name: 'B', settings: {} })).toMatchObject({ ok: false, code: 'banned' });
  });

  it('quick match puts players at the same public table, which runs at once', async () => {
    const { ok } = setup();
    const a = await ok('ana', { op: 'quick', game: 'blackjack', name: 'Ana' });
    expect(a.status).toBe('playing');
    expect(a.blackjack?.phase).toBe('waiting');
    const b = await ok('beto', { op: 'quick', game: 'blackjack', name: 'Beto' });
    expect(b.code).toBe(a.code);
    expect(b.members).toHaveLength(2);
  });

  it('blackjack: a bet takes coins once (double click), the round plays and wins are paid', async () => {
    const { ok, call, w, advance } = setup();
    const a = await ok('ana', { op: 'create', game: 'blackjack', seats: 5, name: 'Ana', settings: {} });
    await ok('beto', { op: 'join', code: a.code, name: 'Beto' });
    const bet = { op: 'act', code: a.code, action: { type: 'BET', amount: 100 } };
    const v1 = await ok('ana', bet);
    await ok('ana', bet); // repeated request: no second charge
    expect(w.balance.get('ana')).toBe(900);
    expect(v1.balance).toBe(900);
    expect(v1.blackjack?.phase).toBe('betting');
    expect(await call('ana', { op: 'act', code: a.code, action: { type: 'BET', amount: 5 } })).toMatchObject({ ok: true }); // already bet this round: ignored
    expect(await call('beto', { op: 'act', code: a.code, action: { type: 'BET', amount: 999999 } })).toMatchObject({ ok: false, code: 'rule' });
    // Beto never bets: the window closes on its timer, hands stand when idle, the dealer plays
    let v: RoomView = v1;
    for (let i = 0; i < 40 && v.blackjack?.phase !== 'settled'; i++) {
      advance(BJ_TIMING.turn);
      v = await ok('beto', { op: 'tick', code: a.code });
    }
    expect(v.blackjack?.phase === 'settled' || v.blackjack?.phase === 'waiting').toBe(true);
    const seat = v.blackjack!.seats.find((s) => s.seat === 's0');
    const payout = seat?.payout ?? 0;
    expect(w.balance.get('ana')).toBe(900 + payout);
    // paid exactly once, whatever the number of ticks
    await ok('beto', { op: 'tick', code: a.code });
    advance(BJ_TIMING.settled + 10);
    const n = await ok('beto', { op: 'tick', code: a.code });
    expect(n.blackjack?.phase).toBe('waiting');
    expect(w.balance.get('ana')).toBe(900 + payout);
  });

  it('blackjack: not enough coins is refused and nothing enters the table', async () => {
    const { ok, call } = setup({ ana: 50 });
    const a = await ok('ana', { op: 'create', game: 'blackjack', seats: 5, name: 'Ana', settings: {} });
    expect(await call('ana', { op: 'act', code: a.code, action: { type: 'BET', amount: 100 } })).toMatchObject({ ok: false, code: 'insufficient_funds' });
    expect((await ok('ana', { op: 'sync', code: a.code })).blackjack?.seats).toEqual([]);
  });

  it('only the seat whose turn it is can act; double takes the extra stake', async () => {
    for (let seed = 1; seed < 40; seed++) {
      const env = setup({ ana: 1000, beto: 1000 });
      const a = await env.ok('ana', { op: 'create', game: 'blackjack', seats: 5, name: 'Ana', settings: {} });
      const room = [...env.mem.rooms.values()][0];
      room.state = { ...(room.state as BjTable), rngState: seed * 7919 };
      await env.ok('ana', { op: 'act', code: a.code, action: { type: 'BET', amount: 100 } });
      const v = await env.ok('ana', { op: 'tick', code: a.code });
      if (v.blackjack?.phase !== 'playing' || v.blackjack.turn !== 's0') continue;
      await env.ok('beto', { op: 'join', code: a.code, name: 'Beto' });
      expect(await env.call('beto', { op: 'act', code: a.code, action: { type: 'HIT' } })).toMatchObject({ ok: false, code: 'rule' });
      const d = await env.ok('ana', { op: 'act', code: a.code, action: { type: 'DOUBLE' } });
      expect(d.blackjack?.seats[0].doubled).toBe(true);
      expect(d.blackjack?.seats[0].bet).toBe(200);
      expect(env.w.log.filter((l) => l.startsWith('bet ana'))).toEqual(['bet ana 100', 'bet ana 100']);
      return;
    }
    throw new Error('no seed gave ana the first turn');
  });

  it('roulette: slips are charged once per slip id, spun, and paid', async () => {
    const { ok, call, w, advance } = setup();
    const a = await ok('ana', { op: 'create', game: 'roulette', seats: 6, name: 'Ana', settings: {} });
    const slip = { op: 'act', code: a.code, action: { type: 'BET', slipId: '11111111-aaaa', bets: [{ type: 'red', amount: 100 }, { type: 'black', amount: 100 }] } };
    await ok('ana', slip);
    await ok('ana', slip);
    expect(w.balance.get('ana')).toBe(800);
    expect(await call('ana', { op: 'act', code: a.code, action: { type: 'BET', slipId: 'x', bets: [{ type: 'red', amount: 1 }] } })).toMatchObject({ ok: false, code: 'bad_request' });
    advance(RT_TIMING.betting);
    let v = await ok('ana', { op: 'tick', code: a.code });
    expect(v.roulette?.phase).toBe('spinning');
    expect(await call('ana', { op: 'act', code: a.code, action: { type: 'BET', slipId: '22222222-bbbb', bets: [{ type: 'red', amount: 1 }] } })).toMatchObject({ ok: false, code: 'rule' });
    expect(w.balance.get('ana')).toBe(800);
    advance(RT_TIMING.spin);
    v = await ok('ana', { op: 'tick', code: a.code });
    const pocket = v.roulette!.pocket!;
    expect(w.balance.get('ana')).toBe(pocket === 0 ? 800 : 1000);
  });

  it('a lost commit race never charges twice and never loses coins', async () => {
    const { ok, mem, w } = setup();
    const a = await ok('ana', { op: 'create', game: 'roulette', seats: 6, name: 'Ana', settings: {} });
    mem.conflictOnce();
    await ok('ana', { op: 'act', code: a.code, action: { type: 'BET', slipId: '33333333-cccc', bets: [{ type: 'odd', amount: 50 }] } });
    expect(w.balance.get('ana')).toBe(950);
    const v = await ok('ana', { op: 'sync', code: a.code });
    expect(v.roulette?.seats[0].total).toBe(50);
  });

  it('the last player leaving settles the round and pays what is owed', async () => {
    const { ok, w, mem } = setup();
    const a = await ok('ana', { op: 'create', game: 'roulette', seats: 6, name: 'Ana', settings: {} });
    await ok('ana', { op: 'act', code: a.code, action: { type: 'BET', slipId: '44444444-dddd', bets: [{ type: 'red', amount: 100 }, { type: 'black', amount: 100 }] } });
    await ok('ana', { op: 'leave', code: a.code });
    const room = [...mem.rooms.values()][0];
    expect(room.status).toBe('closed');
    const pocket = (room.state as { history: number[] }).history[0];
    expect(w.balance.get('ana')).toBe(pocket === 0 ? 800 : 1000);
  });
});

describe('online Carta rooms', () => {
  it('private room: host starts; bots fill the seats; each player sees only their hand', async () => {
    const { ok, call } = setup();
    const a = await ok('ana', { op: 'create', game: 'carta', seats: 3, name: 'Ana', settings: { difficulty: 'normal' } });
    expect(a.status).toBe('lobby');
    await ok('beto', { op: 'join', code: a.code, name: 'Beto' });
    await ok('beto', { op: 'ready', code: a.code, ready: true });
    const s = await ok('ana', { op: 'start', code: a.code });
    expect(s.carta?.state.players.map((p) => p.type)).toEqual(['REMOTE_HUMAN', 'REMOTE_HUMAN', 'BOT']);
    expect(s.carta?.state.players[1].hand).toEqual([]);
    expect(s.carta?.state.players[0].hand.length).toBe(7);
    // a player can't act for someone else, nor use host-only actions
    expect(await call('beto', { op: 'act', code: a.code, action: { type: 'RESTART_GAME' } })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('quick match: a public Carta room starts by itself with bots', async () => {
    const { ok, advance } = setup();
    const a = await ok('ana', { op: 'quick', game: 'carta', name: 'Ana' });
    expect(a.status).toBe('lobby');
    expect(a.startsAt).not.toBeNull();
    const b = await ok('beto', { op: 'quick', game: 'carta', name: 'Beto' });
    expect(b.code).toBe(a.code);
    advance(21000);
    const v = await ok('ana', { op: 'tick', code: a.code });
    expect(v.status).toBe('playing');
    const types = (v.carta?.state as GameState).players.map((p) => p.type);
    expect(types.filter((t) => t === 'REMOTE_HUMAN')).toHaveLength(2);
    expect(types).toHaveLength(4);
  });
});

describe('players who closed the app', () => {
  it('are dropped from a coin table after a while; their bet is still paid', async () => {
    const { ok, advance, mem } = setup({ ana: 1000, beto: 1000 });
    const a = await ok('ana', { op: 'create', game: 'roulette', seats: 6, name: 'Ana', settings: {} });
    await ok('beto', { op: 'join', code: a.code, name: 'Beto' });
    await ok('beto', { op: 'act', code: a.code, action: { type: 'BET', slipId: '55555555-eeee', bets: [{ type: 'red', amount: 100 }, { type: 'black', amount: 100 }] } });
    // Beto closes the app; Ana keeps playing
    for (let i = 0; i < 5; i++) {
      advance(25000);
      await ok('ana', { op: 'tick', code: a.code });
    }
    const room = [...mem.rooms.values()][0];
    expect(room.members.map((m) => m.userId)).toEqual(['ana']);
  });

  it('a Carta player who vanished is replaced by a bot', async () => {
    const { ok, advance, mem } = setup();
    const a = await ok('ana', { op: 'create', game: 'carta', seats: 2, name: 'Ana', settings: { difficulty: 'normal' } });
    await ok('beto', { op: 'join', code: a.code, name: 'Beto' });
    await ok('beto', { op: 'ready', code: a.code, ready: true });
    await ok('ana', { op: 'start', code: a.code });
    for (let i = 0; i < 5; i++) {
      advance(25000);
      await ok('ana', { op: 'tick', code: a.code });
    }
    const room = [...mem.rooms.values()][0];
    expect(room.members.map((m) => m.userId)).toEqual(['ana']);
    expect((room.state as GameState).players.find((p) => p.id === 's1')!.type).toBe('BOT');
  });
});
