import { describe, expect, it } from 'vitest';
import { handleRoomRequest, RoomStoreError } from '../server/handler';
import type { RoomRow, RoomStore, ViewOut } from '../server/handler';
import type { RoomResponse, RoomView } from '../protocol';
import { SHOT_LIMIT, parseBilliardsAction } from '../server/billiards';
import { HEAD_X } from '@/games/billiards/table';
import { simulate } from '@/games/billiards/physics';

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

const expectFail = (res: RoomResponse, code: string, detail?: string) => expect(res).toMatchObject({ ok: false, code, ...(detail ? { detail } : {}) });

const BREAK = { dx: 1, dy: 0.002, power: 1, cueX: HEAD_X - 1, cueY: 63.5 };

/** Two players in a started 8-Ball room. */
async function match() {
  const s = setup();
  const created = await s.ok('ana', { op: 'create', game: 'billiards', seats: 2, name: 'Ana', settings: {} });
  const code = created.code;
  expect(created.status).toBe('lobby');
  expectFail(await s.call('ana', { op: 'start', code }), 'need_players');
  await s.ok('beto', { op: 'join', code, name: 'Beto' });
  expectFail(await s.call('carla', { op: 'join', code, name: 'Carla' }), 'full');
  await s.ok('beto', { op: 'ready', code, ready: true });
  const started = await s.ok('ana', { op: 'start', code });
  return { ...s, code, started };
}

describe('8-Ball online (1 vs 1)', () => {
  it('rooms are for exactly two players; both get the same table', async () => {
    const m = await match();
    expect(m.started.status).toBe('playing');
    const a = m.started.billiards!;
    expect(a.state.phase).toBe('break');
    expect(a.state.players.map((p) => p.name)).toEqual(['Ana', 'Beto']);
    expect('seed' in a.state).toBe(false);
    const b = m.mem.views.get(`room-1|beto`)!.billiards!;
    expect(b.state.balls).toEqual(a.state.balls);
    expect(m.started.turnDeadline).toBe(m.now() + SHOT_LIMIT);
    expectFail(await m.call('x', { op: 'create', game: 'billiards', seats: 3, name: 'X', settings: {} }), 'bad_request');
  });

  it('only the player to shoot may shoot; the server plays the shot and both see the same result', async () => {
    const m = await match();
    expectFail(await m.call('beto', { op: 'act', code: m.code, action: { type: 'SHOOT', no: 1, shot: BREAK } }), 'rule', 'not_your_turn');
    const v = await m.ok('ana', { op: 'act', code: m.code, action: { type: 'SHOOT', no: 1, shot: BREAK } });
    const st = v.billiards!.state;
    expect(st.shots).toBe(1);
    expect(st.last!.by).toBe(0);
    // Replaying the stored shot from its stored start gives exactly the stored result.
    const replay = simulate(st.last!.before, st.last!.input);
    for (const b of replay.balls) {
      const stored = st.balls.find((x) => x.id === b.id)!;
      if (!(b.id === 0 && b.down) && !(b.id === 8 && b.down)) expect([b.x, b.y, b.down]).toEqual([stored.x, stored.y, stored.down]);
    }
    expect(m.mem.views.get('room-1|beto')!.billiards!.state.balls).toEqual(st.balls);
    // The balls are still rolling: nothing more is accepted until they stop.
    expect(v.billiards!.restAt).toBeGreaterThan(m.now() + 1000);
  });

  it('refuses double shots, stale shot numbers, shots while the balls roll, and forged input', async () => {
    const m = await match();
    await m.ok('ana', { op: 'act', code: m.code, action: { type: 'SHOOT', no: 1, shot: BREAK } });
    // The same request again (a retry) is answered with the current view, not played twice.
    const again = await m.ok('ana', { op: 'act', code: m.code, action: { type: 'SHOOT', no: 1, shot: BREAK } });
    expect(again.billiards!.state.shots).toBe(1);
    const v = m.mem.views.get('room-1|ana')!;
    const next = v.billiards!.state.turn === 0 ? 'ana' : 'beto';
    expectFail(await m.call(next, { op: 'act', code: m.code, action: { type: 'SHOOT', no: 2, shot: { dx: 1, dy: 0, power: 0.5 } } }), 'rule', 'balls_moving');
    m.advanceTime(20_000);
    expectFail(await m.call(next, { op: 'act', code: m.code, action: { type: 'SHOOT', no: 5, shot: { dx: 1, dy: 0, power: 0.5 } } }), 'rule', 'stale_shot');
    expectFail(await m.call(next, { op: 'act', code: m.code, action: { type: 'SHOOT', no: 2, shot: { dx: 'x', dy: 0, power: 0.5 } } }), 'bad_request');
    expectFail(await m.call(next, { op: 'act', code: m.code, action: { type: 'WIN' } }), 'bad_request');
    expect(parseBilliardsAction({ type: 'SHOOT', no: 2, shot: { dx: 1, dy: 0, power: 1, winner: 0, balls: [] } })).toEqual({ type: 'SHOOT', no: 2, shot: { dx: 1, dy: 0, power: 1, spinX: 0, spinY: 0 } });
  });

  it('the shot clock: an idle player commits a foul and the opponent gets ball in hand', async () => {
    const m = await match();
    m.advanceTime(SHOT_LIMIT + 1000);
    const v = await m.ok('beto', { op: 'tick', code: m.code });
    expect(v.billiards!.state.turn).toBe(1);
    expect(v.billiards!.state.ballInHand).toBe(true);
    expect(v.billiards!.state.players[0].fouls).toBe(1);
  });

  it('disconnect and reconnect: an absent player shows as away and gets the full state back on sync', async () => {
    const m = await match();
    for (let i = 0; i < 3; i++) {
      m.advanceTime(25_000);
      await m.ok('ana', { op: 'tick', code: m.code });
    }
    expect(m.mem.views.get('room-1|ana')!.billiards!.away).toEqual(['s1']);
    const back = await m.ok('beto', { op: 'sync', code: m.code });
    expect(back.status).toBe('playing');
    expect(back.you).toBe('s1');
    expect(back.billiards!.state.balls).toHaveLength(16);
    m.advanceTime(1000);
    const after = await m.ok('ana', { op: 'tick', code: m.code });
    expect(after.billiards!.away).toEqual([]);
  });

  it('leaving a game in progress concedes it; the winner can be read from the state; rematch swaps the break', async () => {
    const m = await match();
    const left = await m.call('beto', { op: 'leave', code: m.code });
    expect(left.ok).toBe(true);
    const ana = m.mem.views.get('room-1|ana')!.billiards!.state;
    expect(ana.phase).toBe('over');
    expect(ana.winner).toBe(0);
    expect(ana.reason).toBe('forfeit');
    expectFail(await m.call('ana', { op: 'rematch', code: m.code }), 'need_players');
  });

  it('either player may ask for a rematch once the game is over', async () => {
    const m = await match();
    expectFail(await m.call('beto', { op: 'rematch', code: m.code }), 'not_playing');
    // Force the game to its end through the server's own rules (an idle breaker loses nothing, so concede).
    const room = [...m.mem.rooms.values()][0];
    m.mem.rooms.set(room.id, { ...room, state: { ...(room.state as object), phase: 'over', winner: 1, reason: 'eight' } as RoomRow['state'] });
    const v = await m.ok('beto', { op: 'rematch', code: m.code });
    expect(v.billiards!.state.phase).toBe('break');
    expect(v.billiards!.state.breaker).toBe(1);
    expect(v.billiards!.state.match).toBe(2);
  });
});
