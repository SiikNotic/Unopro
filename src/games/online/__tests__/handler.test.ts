import { describe, expect, it } from 'vitest';
import { advance, handleRoomRequest, parseRequest, RoomStoreError, TIMING } from '../server/handler';
import type { RoomRow, RoomStore, ViewOut } from '../server/handler';
import type { RoomResponse, RoomView } from '../protocol';
import type { DominoState } from '@/games/domino/engine';
import type { BingoState } from '@/games/bingo/engine';

/** Behaves like the SQL functions: unique codes, optimistic version check, one view row per member. */
function memoryStore() {
  const rooms = new Map<string, RoomRow>();
  const views = new Map<string, RoomView>(); // `${roomId}|${userId}`
  const written: ViewOut[] = [];
  let ids = 0;
  const writeViews = (roomId: string, members: RoomRow['members'], out: ViewOut[]) => {
    for (const v of out) {
      if (!members.some((m) => m.userId === v.userId)) throw new RoomStoreError('invalid');
      views.set(`${roomId}|${v.userId}`, v.view);
      written.push(v);
    }
    for (const k of [...views.keys()]) if (k.startsWith(`${roomId}|`) && !members.some((m) => k.endsWith(`|${m.userId}`))) views.delete(k);
  };
  const store: RoomStore = {
    async insert(room, makeViews) {
      if ([...rooms.values()].some((r) => r.code === room.code)) throw new RoomStoreError('conflict');
      const id = `room-${++ids}`;
      const row: RoomRow = { ...room, id, status: 'lobby', state: null, clock: { lastAt: 0, lastCallAt: 0, closingAt: 0, roundOverAt: 0 }, version: 1 };
      rooms.set(id, row);
      writeViews(id, row.members, makeViews(id));
      return structuredClone(row);
    },
    async load(code) {
      const r = [...rooms.values()].find((x) => x.code === code);
      return r ? structuredClone(r) : null;
    },
    async commit(room, out) {
      const cur = rooms.get(room.id)!;
      if (cur.version !== room.version) throw new RoomStoreError('conflict');
      const next = { ...structuredClone(room), version: cur.version + 1 };
      rooms.set(room.id, next);
      writeViews(room.id, next.members, out);
      return next.version;
    },
  };
  return { store, rooms, views, written };
}

function setup() {
  let t = 1_000_000;
  let r = 7;
  const mem = memoryStore();
  const deps = { store: mem.store, now: () => t, randomInt: (n: number) => (r = (r * 1103515245 + 12345) & 0x7fffffff) % n };
  const call = (user: string | null, body: unknown) => handleRoomRequest(user, body, deps);
  const ok = async (user: string, body: unknown): Promise<RoomView> => {
    const res = await call(user, body);
    if (!res.ok) throw new Error(`${JSON.stringify(body)} → ${res.code} ${res.detail ?? ''}`);
    return res.view;
  };
  return { mem, call, ok, advanceTime: (ms: number) => (t += ms), now: () => t };
}

const expectFail = (res: RoomResponse, code: string) => expect(res).toMatchObject({ ok: false, code });

describe('game-room server: lobby', () => {
  it('creates a room with a valid code; others join free seats; host starts when everyone is ready', async () => {
    const s = setup();
    const created = await s.ok('ana', { op: 'create', game: 'domino', seats: 4, name: 'Ana', settings: { difficulty: 'normal', target: 100 } });
    expect(created.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(created.you).toBe('s0');
    const code = created.code;
    const beto = await s.ok('beto', { op: 'join', code, name: 'Beto' });
    expect(beto.you).toBe('s1');
    expect(await s.ok('beto', { op: 'join', code, name: 'Beto' })).toMatchObject({ you: 's1' }); // idempotent
    expectFail(await s.call('ana', { op: 'start', code }), 'not_ready');
    expectFail(await s.call('beto', { op: 'start', code }), 'not_host');
    await s.ok('beto', { op: 'ready', code, ready: true });
    const started = await s.ok('ana', { op: 'start', code });
    expect(started.status).toBe('playing');
    expect(started.domino!.seats.map((x) => [x.id, x.kind])).toEqual([['s0', 'human'], ['s1', 'human'], ['s2', 'bot'], ['s3', 'bot']]);
    expectFail(await s.call('carla', { op: 'join', code, name: 'Carla' }), 'started');
  });

  it('refuses a full room, unknown codes, bad input and unauthenticated calls', async () => {
    const s = setup();
    const { code } = await s.ok('a', { op: 'create', game: 'bingo', seats: 2, name: 'A', settings: { difficulty: 'easy', speed: 'fast' } });
    await s.ok('b', { op: 'join', code, name: 'B' });
    expectFail(await s.call('c', { op: 'join', code, name: 'C' }), 'full');
    expectFail(await s.call('c', { op: 'join', code: 'ZZZZZ', name: 'C' }), 'not_found');
    expectFail(await s.call(null, { op: 'sync', code }), 'unauthorized');
    for (const bad of [null, [], { op: 'nuke' }, { op: 'create', game: 'chess', seats: 2, name: 'x', settings: {} }, { op: 'create', game: 'domino', seats: 1, name: 'x', settings: { difficulty: 'easy', target: 100 } }, { op: 'join', code: 'ab7k2', name: 'x' }, { op: 'join', code, name: '   ' }, { op: 'ready', code, ready: 'yes' }]) {
      expectFail(await s.call('a', bad), 'bad_request');
    }
    expect(parseRequest({ op: 'join', code, name: '<b>Evil</b>\u0000' })).toEqual({ op: 'join', code, name: 'bEvil/b' });
  });

  it('a non-member cannot read or act on a room', async () => {
    const s = setup();
    const { code } = await s.ok('a', { op: 'create', game: 'bingo', seats: 2, name: 'A', settings: { difficulty: 'easy', speed: 'fast' } });
    for (const op of ['sync', 'tick', 'ready', 'start', 'leave']) expectFail(await s.call('x', { op, code, ready: true }), 'not_member');
    expectFail(await s.call('x', { op: 'act', code, action: { type: 'CLAIM', playerId: 's0' } }), 'not_member');
  });

  it('the host leaving the lobby closes it; a guest leaving frees the seat', async () => {
    const s = setup();
    const { code } = await s.ok('a', { op: 'create', game: 'bingo', seats: 3, name: 'A', settings: { difficulty: 'easy', speed: 'fast' } });
    await s.ok('b', { op: 'join', code, name: 'B' });
    await s.ok('b', { op: 'leave', code });
    expect((await s.ok('c', { op: 'join', code, name: 'C' })).you).toBe('s1');
    await s.ok('a', { op: 'leave', code });
    expectFail(await s.call('c', { op: 'sync', code }), 'not_found');
  });
});

describe('game-room server: domino match', () => {
  async function started() {
    const s = setup();
    const { code } = await s.ok('ana', { op: 'create', game: 'domino', seats: 3, name: 'Ana', settings: { difficulty: 'hard', target: 100 } });
    await s.ok('beto', { op: 'join', code, name: 'Beto' });
    await s.ok('beto', { op: 'ready', code, ready: true });
    await s.ok('ana', { op: 'start', code });
    return { s, code, users: { s0: 'ana', s1: 'beto' } as Record<string, string> };
  }

  it('a player may only act for their own seat, and only legal moves', async () => {
    const { s, code } = await started();
    const room = [...s.mem.rooms.values()][0];
    const st = room.state as DominoState;
    const cur = st.players[st.current].id;
    const other = cur === 's0' ? 'beto' : 'ana';
    const legal = (await s.ok(cur === 's0' ? 'ana' : cur === 's1' ? 'beto' : 'ana', { op: 'sync', code })).domino!;
    expectFail(await s.call(other, { op: 'act', code, action: { type: 'DRAW', playerId: cur } }), 'forbidden');
    expectFail(await s.call('ana', { op: 'act', code, action: { type: 'PLAY_TILE', playerId: 's0', tileId: '9-9', end: 'left' } }), 'forbidden');
    void legal;
  });

  it('plays a whole match: humans act from their views, bots and idle turns run on the server clock', async () => {
    const { s, code, users } = await started();
    for (let guard = 0; guard < 3000; guard++) {
      const room = [...s.mem.rooms.values()][0];
      const st = room.state as DominoState;
      if (st.status === 'game_over') break;
      if (st.status === 'playing' && st.players[st.current].kind === 'human') {
        const seat = st.players[st.current].id;
        const view = await s.ok(users[seat], { op: 'sync', code });
        if (view.domino!.currentId === seat && view.domino!.legal.length) {
          await s.ok(users[seat], { op: 'act', code, action: view.domino!.legal[0] });
          continue;
        }
      }
      s.advanceTime(1000);
      await s.ok('ana', { op: 'tick', code });
    }
    const final = [...s.mem.rooms.values()][0].state as DominoState;
    expect(final.status).toBe('game_over');
    expect(Math.max(...Object.values(final.scores))).toBeGreaterThanOrEqual(100);
  });

  it('an idle human has a move played for them after the turn limit', async () => {
    const { s, code } = await started();
    for (let i = 0; i < 20; i++) {
      s.advanceTime(TIMING.turnLimit + 1);
      await s.ok('ana', { op: 'tick', code });
    }
    // Rounds may end and restart on their own meanwhile, so count applied moves, not tiles on the line.
    expect(([...s.mem.rooms.values()][0].state as DominoState).turn).toBeGreaterThan(15);
  });

  it('views never contain other hands, the boneyard or the seed', async () => {
    const { s, code } = await started();
    s.advanceTime(5000);
    await s.ok('ana', { op: 'tick', code });
    const st = [...s.mem.rooms.values()][0].state as DominoState;
    for (const v of s.mem.written) {
      const seat = v.view.you;
      const text = JSON.stringify(v.view);
      expect(text).not.toContain('rngState');
      expect(text).not.toContain('"seed"');
      for (const p of st.players) if (p.id !== seat) for (const t of p.hand) if (!st.players.find((x) => x.id === seat)!.hand.some((h) => h.id === t.id) && !st.line.some((l) => l.tile.id === t.id)) {
        expect(v.view.domino?.hand.some((h) => h.id === t.id) ?? false).toBe(false);
      }
      expect(v.view.domino ? 'boneyard' in v.view.domino : false).toBe(false);
    }
  });

  it('a race between two actions on the same version: one wins, the other retries on the new state', async () => {
    const { s, code } = await started();
    const results = await Promise.all([s.call('ana', { op: 'tick', code }), s.call('beto', { op: 'tick', code }), s.call('ana', { op: 'sync', code })]);
    results.forEach((r) => expect(r.ok).toBe(true));
  });
});

describe('game-room server: bingo match', () => {
  it('the caller runs on the server clock; spamming ticks does not speed it up', async () => {
    const s = setup();
    const { code } = await s.ok('a', { op: 'create', game: 'bingo', seats: 2, name: 'A', settings: { difficulty: 'easy', speed: 'normal' } });
    await s.ok('a', { op: 'start', code });
    for (let i = 0; i < 50; i++) await s.ok('a', { op: 'tick', code });
    expect(([...s.mem.rooms.values()][0].state as BingoState).called.length).toBe(0);
    s.advanceTime(TIMING.firstBall);
    await s.ok('a', { op: 'tick', code });
    expect(([...s.mem.rooms.values()][0].state as BingoState).called.length).toBe(1);
    s.advanceTime(TIMING.pace.normal);
    await s.ok('a', { op: 'tick', code });
    expect(([...s.mem.rooms.values()][0].state as BingoState).called.length).toBe(2);
    // After a long silence (nobody ticking), the caller resumes calmly instead of firing a burst.
    s.advanceTime(TIMING.pace.normal * 10);
    await s.ok('a', { op: 'tick', code });
    expect(([...s.mem.rooms.values()][0].state as BingoState).called.length).toBe(3);
  });

  it('two people and two bots play to a real winner; marks of others are hidden in events', async () => {
    const s = setup();
    const { code } = await s.ok('a', { op: 'create', game: 'bingo', seats: 4, name: 'A', settings: { difficulty: 'hard', speed: 'fast' } });
    await s.ok('b', { op: 'join', code, name: 'B' });
    await s.ok('b', { op: 'ready', code, ready: true });
    await s.ok('a', { op: 'start', code });
    const users: Record<string, string> = { s0: 'a', s1: 'b' };
    for (let guard = 0; guard < 2000; guard++) {
      const st = [...s.mem.rooms.values()][0].state as BingoState;
      if (st.status === 'round_over') break;
      for (const seat of ['s0', 's1']) {
        const v = (await s.ok(users[seat], { op: 'sync', code })).bingo!;
        if (v.canClaim) await s.ok(users[seat], { op: 'act', code, action: { type: 'CLAIM', playerId: seat } });
        else if (v.toMark.length) await s.ok(users[seat], { op: 'act', code, action: { type: 'MARK_NUMBER', playerId: seat, number: v.toMark[0] } });
      }
      s.advanceTime(500);
      await s.ok('a', { op: 'tick', code });
    }
    const st = [...s.mem.rooms.values()][0].state as BingoState;
    expect(st.status).toBe('round_over');
    expect(st.lastResult!.winners.length).toBeGreaterThan(0);
    for (const v of s.mem.written) for (const e of v.view.events) if (e.type === 'marked' && e.playerId !== v.view.you) expect(e.number).toBe(0);
    for (const v of s.mem.written) expect(JSON.stringify(v.view)).not.toContain('drawOrder');
  });

  it('only the server calls balls', async () => {
    const s = setup();
    const { code } = await s.ok('a', { op: 'create', game: 'bingo', seats: 1, name: 'A', settings: { difficulty: 'easy', speed: 'fast' } });
    await s.ok('a', { op: 'start', code });
    expectFail(await s.call('a', { op: 'act', code, action: { type: 'CALL_NUMBER' } }), 'forbidden');
    expectFail(await s.call('a', { op: 'act', code, action: { type: 'CLOSE_ROUND' } }), 'forbidden');
  });

  it('advance() is deterministic for the same room and time', async () => {
    const s = setup();
    const { code } = await s.ok('a', { op: 'create', game: 'bingo', seats: 4, name: 'A', settings: { difficulty: 'normal', speed: 'fast' } });
    await s.ok('a', { op: 'start', code });
    const room = [...s.mem.rooms.values()][0];
    expect(advance(room, s.now() + 60000)).toEqual(advance(structuredClone(room), s.now() + 60000));
  });
});
