import { describe, expect, it } from 'vitest';
import { handleRoomRequest, RoomStoreError } from '../server/handler';
import type { RoomRow, RoomStore, TableWallet, ViewOut } from '../server/handler';
import type { RoomView } from '../protocol';
import type { DominoState } from '@/games/domino/engine';
import type { BingoState } from '@/games/bingo/engine';

// Coin stakes in online Domino / Bingo / Carta rooms, and the owner's "out of service" switch. The wallet
// here behaves like table_bet / table_pay: idempotent on the request id, balance checked on every bet.
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

function setup(start: Record<string, number> = { ana: 1000, beto: 1000 }, flags = {}, enabled: Record<string, boolean> = {}) {
  let t = 2_000_000;
  let r = 11;
  const mem = memoryStore();
  const w = memoryWallet(start, flags);
  const deps = { store: mem.store, wallet: w.wallet, now: () => t, randomInt: (n: number) => (r = (r * 1103515245 + 12345) & 0x7fffffff) % n, requestId: async (k: string) => k, availability: async (g: string) => enabled[g] ?? true };
  const call = (user: string, body: unknown) => handleRoomRequest(user, body, deps);
  const ok = async (user: string, body: unknown): Promise<RoomView> => {
    const res = await call(user, body);
    if (!res.ok) throw new Error(`${JSON.stringify(body)} → ${res.code} ${res.detail ?? ''}`);
    return res.view;
  };
  return { mem, w, call, ok, advance: (ms: number) => (t += ms) };
}


/** Ends the current Domino match in the stored room with these winning seats (as the engine would). */
function finishDomino(mem: ReturnType<typeof memoryStore>, code: string, winners: string[]) {
  const row = [...mem.rooms.values()].find((r) => r.code === code)!;
  row.state = { ...(row.state as DominoState), status: 'game_over', matchWinners: winners };
}

async function stakedDomino(s: ReturnType<typeof setup>, stake = 500) {
  const a = await s.ok('ana', { op: 'create', game: 'domino', seats: 4, name: 'Ana', settings: { difficulty: 'normal', target: 100, stake } });
  await s.ok('beto', { op: 'join', code: a.code, name: 'Beto' });
  await s.ok('beto', { op: 'ready', code: a.code, ready: true });
  return a.code;
}

describe('staked rooms', () => {
  it('only the fixed stakes are accepted, and only from registered players', async () => {
    const s = setup({ ana: 1000, g: 1000 }, { g: { registered: false } });
    expect(await s.call('ana', { op: 'create', game: 'domino', seats: 2, name: 'Ana', settings: { difficulty: 'normal', target: 100, stake: 123 } })).toMatchObject({ ok: false, code: 'bad_request' });
    expect(await s.call('ana', { op: 'create', game: 'bingo', seats: 2, name: 'Ana', settings: { difficulty: 'normal', speed: 'normal', stake: -500 } })).toMatchObject({ ok: false, code: 'bad_request' });
    expect(await s.call('g', { op: 'create', game: 'carta', seats: 2, name: 'G', settings: { difficulty: 'normal', stake: 100 } })).toMatchObject({ ok: false, code: 'not_registered' });
    const room = await s.ok('ana', { op: 'create', game: 'carta', seats: 2, name: 'Ana', settings: { difficulty: 'normal', stake: 100 } });
    expect(room.pot).toMatchObject({ stake: 100, players: 0, total: 0 });
    expect(await s.call('g', { op: 'join', code: room.code, name: 'G' })).toMatchObject({ ok: false, code: 'not_registered' });
    // a free room stays free for guests
    const free = await s.ok('ana', { op: 'create', game: 'carta', seats: 2, name: 'Ana', settings: { difficulty: 'normal' } });
    expect(free.pot).toBeNull();
    expect(await s.call('g', { op: 'join', code: free.code, name: 'G' })).toMatchObject({ ok: true });
  });

  it('public rooms are never staked', async () => {
    const s = setup();
    const v = await s.ok('ana', { op: 'create', game: 'carta', seats: 4, name: 'Ana', settings: { difficulty: 'normal', public: true, stake: 500 } });
    expect(v.pot).toBeNull();
  });

  it('the start takes every stake once; the winner gets the pot once, however many requests follow', async () => {
    const s = setup();
    const code = await stakedDomino(s);
    const started = await s.ok('ana', { op: 'start', code });
    expect(started.status).toBe('playing');
    expect(s.w.balance.get('ana')).toBe(500);
    expect(s.w.balance.get('beto')).toBe(500);
    expect(started.pot).toMatchObject({ stake: 500, players: 2, total: 1000, settled: false });
    expect(started.balance).toBe(500);
    // a repeated start does nothing more
    expect(await s.call('ana', { op: 'start', code })).toMatchObject({ ok: false, code: 'started' });
    finishDomino(s.mem, code, ['s1']);
    const end = await s.ok('ana', { op: 'tick', code });
    expect(end.pot).toMatchObject({ settled: true, winners: ['s1'], prize: 1000 });
    for (let i = 0; i < 3; i++) await s.ok(i % 2 ? 'ana' : 'beto', { op: 'tick', code });
    expect(s.w.balance.get('beto')).toBe(1500);
    expect(s.w.balance.get('ana')).toBe(500);
    expect(s.w.log.filter((l) => l.startsWith('pay'))).toEqual(['pay beto 1000']);
  });

  it('a tie splits the pot; a bot or a player who left wins nothing', async () => {
    const s = setup({ ana: 1000, beto: 1000, cris: 1000 });
    const a = await s.ok('ana', { op: 'create', game: 'domino', seats: 4, name: 'Ana', settings: { difficulty: 'normal', target: 100, stake: 100 } });
    for (const u of ['beto', 'cris']) {
      await s.ok(u, { op: 'join', code: a.code, name: u });
      await s.ok(u, { op: 'ready', code: a.code, ready: true });
    }
    await s.ok('ana', { op: 'start', code: a.code });
    await s.ok('cris', { op: 'leave', code: a.code });
    // Ana, Cris (left) and the bot in s3 tie: only Ana is paid, and she takes the whole pot of 300
    finishDomino(s.mem, a.code, ['s0', 's2', 's3']);
    const v = await s.ok('beto', { op: 'tick', code: a.code });
    expect(v.pot).toMatchObject({ settled: true, winners: ['s0'], prize: 300 });
    expect(s.w.balance.get('ana')).toBe(1200);
    expect(s.w.balance.get('beto')).toBe(900);
    expect(s.w.balance.get('cris')).toBe(900);
  });

  it('nobody can stake more than they have: the match does not start and stakes taken are given back', async () => {
    const s = setup({ ana: 1000, beto: 100 });
    const code = await stakedDomino(s);
    expect(await s.call('ana', { op: 'start', code })).toMatchObject({ ok: false, code: 'insufficient_funds', detail: 'Beto' });
    expect(s.w.balance.get('ana')).toBe(1000);
    expect(s.w.balance.get('beto')).toBe(100);
    const v = await s.ok('ana', { op: 'sync', code });
    expect(v.status).toBe('lobby');
  });

  it('each stake records its room and pot, and a refund names the stake it gives back (for refund_orphan_stakes)', async () => {
    const s = setup({ ana: 1000, beto: 100 });
    const details: Record<string, unknown>[] = [];
    const { bet, pay } = s.w.wallet;
    s.w.wallet.bet = (u, id, g, amount, detail) => (details.push({ op: 'bet', id, ...detail }), bet(u, id, g, amount, detail));
    s.w.wallet.pay = (u, id, g, amount, detail) => (details.push({ op: 'pay', id, ...detail }), pay(u, id, g, amount, detail));
    const code = await stakedDomino(s);
    await s.call('ana', { op: 'start', code });
    const room = [...s.mem.rooms.values()].find((r) => r.code === code)!;
    const stake = details.find((d) => d.op === 'bet')!;
    expect(stake).toMatchObject({ room: code, roomId: room.id, match: 1, kind: 'stake' });
    expect(typeof stake.nonce).toBe('string');
    // Beto couldn't pay: Ana's stake came back, with the id refund_orphan_stakes would use for it
    const refund = details.find((d) => d.op === 'pay')!;
    expect(refund).toMatchObject({ refund: true, refundOf: stake.id, id: `${stake.id}|refund` });
  });

  it('a staked match needs two players', async () => {
    const s = setup();
    const a = await s.ok('ana', { op: 'create', game: 'domino', seats: 2, name: 'Ana', settings: { difficulty: 'normal', target: 100, stake: 100 } });
    expect(await s.call('ana', { op: 'start', code: a.code })).toMatchObject({ ok: false, code: 'need_players' });
    expect(s.w.balance.get('ana')).toBe(1000);
  });

  it('a start that loses a race gives the stakes back and charges once in the end', async () => {
    const s = setup();
    const code = await stakedDomino(s);
    s.mem.conflictOnce();
    const v = await s.ok('ana', { op: 'start', code });
    expect(v.status).toBe('playing');
    expect(s.w.balance.get('ana')).toBe(500);
    expect(s.w.balance.get('beto')).toBe(500);
    expect(s.w.log.filter((l) => l.startsWith('bet'))).toHaveLength(4);
    expect(s.w.log.filter((l) => l.startsWith('pay'))).toHaveLength(2);
  });

  it('a rematch takes new stakes only after the last pot was paid', async () => {
    const s = setup();
    const code = await stakedDomino(s, 100);
    await s.ok('ana', { op: 'start', code });
    expect(await s.call('ana', { op: 'rematch', code })).toMatchObject({ ok: false });
    finishDomino(s.mem, code, ['s0']);
    await s.ok('ana', { op: 'tick', code });
    const again = await s.ok('ana', { op: 'rematch', code });
    expect(again.pot).toMatchObject({ players: 2, total: 200, settled: false });
    expect(s.w.balance.get('ana')).toBe(1000); // 1000 - 100 + 200 - 100
    expect(s.w.balance.get('beto')).toBe(800);
  });

  it('staked Bingo is one round: no automatic or player-started next round', async () => {
    const s = setup();
    const a = await s.ok('ana', { op: 'create', game: 'bingo', seats: 2, name: 'Ana', settings: { difficulty: 'normal', speed: 'fast', stake: 100 } });
    await s.ok('beto', { op: 'join', code: a.code, name: 'Beto' });
    await s.ok('beto', { op: 'ready', code: a.code, ready: true });
    await s.ok('ana', { op: 'start', code: a.code });
    const row = [...s.mem.rooms.values()].find((r) => r.code === a.code)!;
    const b = row.state as BingoState;
    row.state = { ...b, status: 'round_over', lastResult: { round: b.round, winners: ['s0'], atCall: 20, pointsEach: 10 } };
    const v = await s.ok('beto', { op: 'tick', code: a.code });
    expect(v.pot).toMatchObject({ settled: true, winners: ['s0'], prize: 200 });
    s.advance(60_000);
    const later = await s.ok('beto', { op: 'tick', code: a.code });
    expect(later.bingo?.status).toBe('round_over');
    expect(await s.call('beto', { op: 'act', code: a.code, action: { type: 'NEXT_ROUND', playerId: 's1' } })).toMatchObject({ ok: false, code: 'rule' });
    expect(s.w.balance.get('ana')).toBe(1100);
  });
});

describe('games out of service', () => {
  it('no new rooms, joins or matches; a match already running carries on', async () => {
    const enabled: Record<string, boolean> = {};
    const s = setup({ ana: 1000, beto: 1000 }, {}, enabled);
    const a = await s.ok('ana', { op: 'create', game: 'domino', seats: 2, name: 'Ana', settings: { difficulty: 'normal', target: 100 } });
    const b = await s.ok('ana', { op: 'create', game: 'bingo', seats: 2, name: 'Ana', settings: { difficulty: 'normal', speed: 'normal' } });
    await s.ok('ana', { op: 'start', code: b.code });
    enabled.domino = false;
    enabled.bingo = false;
    enabled.carta = false;
    expect(await s.call('ana', { op: 'create', game: 'domino', seats: 2, name: 'Ana', settings: { difficulty: 'normal', target: 100 } })).toMatchObject({ ok: false, code: 'disabled' });
    expect(await s.call('ana', { op: 'quick', game: 'carta', name: 'Ana' })).toMatchObject({ ok: false, code: 'disabled' });
    expect(await s.call('beto', { op: 'join', code: a.code, name: 'Beto' })).toMatchObject({ ok: false, code: 'disabled' });
    expect(await s.call('ana', { op: 'start', code: a.code })).toMatchObject({ ok: false, code: 'disabled' });
    expect(await s.call('ana', { op: 'rematch', code: b.code })).toMatchObject({ ok: false, code: 'disabled' });
    s.advance(10_000);
    expect(await s.call('ana', { op: 'tick', code: b.code })).toMatchObject({ ok: true });
    // coin tables aren't part of this switch
    expect(await s.call('ana', { op: 'quick', game: 'roulette', name: 'Ana' })).toMatchObject({ ok: true });
    enabled.domino = true;
    expect(await s.call('ana', { op: 'start', code: a.code })).toMatchObject({ ok: true });
  });
});
