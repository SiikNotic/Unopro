// The game-room server's logic, free of any platform API: it runs in the Supabase edge function (bundled
// for Deno) and in the tests. It is the ONLY authority over online matches:
//   - who is who comes from the verified JWT (userId), never from the request body;
//   - a player acts only for their own seat; the number caller and the bots are the server's own;
//   - every action is parsed as untrusted input and applied by the same pure engines the app uses;
//   - timing (bot moves, Bingo balls, claim window, idle turns) runs on the server's clock, so a client
//     spamming requests can't speed anything up;
//   - each member receives only their own view (no other hands or cards, no ball order, no seed).
import { applyDomino, createDomino, dominoView, parseDominoAction, rematch as dominoRematch } from '@/games/domino/engine';
import type { DominoAction, DominoEvent, DominoState } from '@/games/domino/engine';
import { applyBingo, bingoView, createBingo, parseBingoAction } from '@/games/bingo/engine';
import type { BingoAction, BingoEvent, BingoState } from '@/games/bingo/engine';
import { decideDomino } from '@/games/domino/bots/dominoBot';
import { decideBingo } from '@/games/bingo/bots/bingoBot';
import { newRoomCode, ROOM_CODE_RE } from '@/games/shared/multiplayer/roomCode';
import { BINGO_SPEEDS, DIFFICULTIES } from '@/games/shared/setup';
import type { RoomErrorCode, RoomGame, RoomRequest, RoomResponse, RoomSettings, RoomStatus, RoomView } from '../protocol';

export interface Member {
  userId: string;
  seat: string;
  name: string;
  ready: boolean;
}

export interface Clock {
  /** Last applied move (domino) — bots and idle-turn timeouts count from here. */
  lastAt: number;
  /** Bingo: when the last ball was called. */
  lastCallAt: number;
  /** Bingo: when the first valid claim closed the calling. */
  closingAt: number;
  /** When the current round ended (auto next round). */
  roundOverAt: number;
}

export interface RoomRow {
  id: string;
  code: string;
  game: RoomGame;
  seats: number;
  host: string;
  status: RoomStatus;
  members: Member[];
  settings: RoomSettings;
  state: DominoState | BingoState | null;
  clock: Clock;
  version: number;
}

export interface ViewOut {
  userId: string;
  view: RoomView;
}

export class RoomStoreError extends Error {
  constructor(readonly code: 'conflict' | 'invalid') {
    super(code);
  }
}

/** Persistence. `commit` must fail with RoomStoreError('conflict') if the version moved on. */
export interface RoomStore {
  insert(room: Omit<RoomRow, 'id' | 'version' | 'state' | 'clock' | 'status'>, views: (roomId: string) => ViewOut[]): Promise<RoomRow>;
  load(code: string): Promise<RoomRow | null>;
  commit(room: RoomRow, views: ViewOut[]): Promise<number>;
}

export interface RoomDeps {
  store: RoomStore;
  now?: () => number;
  /** Uniform integer in [0, n) — crypto in production. */
  randomInt?: (n: number) => number;
  allow?: (userId: string) => boolean;
}

/** Timings (ms). */
export const TIMING = {
  /** A human who doesn't move in this long has a sensible move played for them. */
  turnLimit: 45000,
  /** Bingo: balls, per speed. */
  pace: { slow: 5200, normal: 3800, fast: 2600 } as Record<string, number>,
  /** Bingo: other players may still share a BINGO for this long after the first. */
  claimWindow: 1600,
  /** Bingo: with all balls out and nobody claiming, close after this long. */
  allOut: 10000,
  /** The next round starts by itself after this long (anyone may start it sooner). */
  nextRound: 12000,
  /** First ball after the start. */
  firstBall: 2500,
};

const fail = (code: RoomErrorCode, detail?: string): RoomResponse => ({ ok: false, code, detail });

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Drop control characters and angle brackets (names are shown as text, but keep them plain).
  const name = [...raw].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127 && ch !== '<' && ch !== '>').join('').trim().slice(0, 16);
  return name.length ? name : null;
}

function cleanSettings(game: RoomGame, raw: unknown): RoomSettings | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!DIFFICULTIES.includes(r.difficulty as never)) return null;
  if (game === 'domino') return r.target === 100 || r.target === 200 ? { difficulty: r.difficulty as RoomSettings['difficulty'], target: r.target } : null;
  return BINGO_SPEEDS.includes(r.speed as never) ? { difficulty: r.difficulty as RoomSettings['difficulty'], speed: r.speed as RoomSettings['speed'] } : null;
}

/** Parses the body into a request, or null. Unknown fields are ignored; wrong types reject. */
export function parseRequest(raw: unknown): RoomRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === 'string' && ROOM_CODE_RE.test(r.code) ? r.code : null;
  switch (r.op) {
    case 'create': {
      if (r.game !== 'domino' && r.game !== 'bingo') return null;
      const seats = r.seats;
      if (!Number.isInteger(seats) || (seats as number) < (r.game === 'domino' ? 2 : 1) || (seats as number) > 4) return null;
      const name = cleanName(r.name);
      const settings = cleanSettings(r.game, r.settings);
      return name && settings ? { op: 'create', game: r.game, seats: seats as number, name, settings } : null;
    }
    case 'join': {
      const name = cleanName(r.name);
      return code && name ? { op: 'join', code, name } : null;
    }
    case 'ready':
      return code && typeof r.ready === 'boolean' ? { op: 'ready', code, ready: r.ready } : null;
    case 'act':
      return code && r.action && typeof r.action === 'object' ? { op: 'act', code, action: r.action as DominoAction } : null;
    case 'start':
    case 'tick':
    case 'sync':
    case 'leave':
    case 'rematch':
      return code ? { op: r.op, code } : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- views

const SEATS = ['s0', 's1', 's2', 's3'];

function sanitizeEvents(game: RoomGame, events: (DominoEvent | BingoEvent)[], seat: string): (DominoEvent | BingoEvent)[] {
  if (game === 'domino') return events;
  // Which numbers someone else daubed would reveal part of their card: keep only that they daubed.
  return events.map((e) => (e.type === 'marked' && e.playerId !== seat ? { ...e, number: 0 } : e));
}

export function viewFor(room: RoomRow, member: Member, now: number, events: (DominoEvent | BingoEvent)[] = []): RoomView {
  const domino = room.game === 'domino' && room.state ? dominoView(room.state as DominoState, member.seat) : null;
  const bingo = room.game === 'bingo' && room.state ? bingoView(room.state as BingoState, member.seat) : null;
  let turnDeadline: number | null = null;
  if (domino && domino.status === 'playing') {
    const cur = (room.state as DominoState).players[(room.state as DominoState).current];
    if (cur.kind !== 'bot') turnDeadline = room.clock.lastAt + TIMING.turnLimit;
  }
  return {
    roomId: room.id,
    code: room.code,
    game: room.game,
    seats: room.seats,
    status: room.status,
    settings: room.settings,
    you: member.seat,
    members: room.members.map((m) => ({ seat: m.seat, name: m.name, ready: m.ready, host: m.userId === room.host })),
    version: room.version,
    serverNow: now,
    turnDeadline,
    domino,
    bingo,
    events: sanitizeEvents(room.game, events, member.seat),
  };
}

const viewsFor = (room: RoomRow, now: number, events: (DominoEvent | BingoEvent)[]): ViewOut[] => room.members.map((m) => ({ userId: m.userId, view: viewFor(room, m, now, events) }));

// ---------------------------------------------------------------- the server's own moves

function seedOf(room: RoomRow): number {
  return (room.state as { seed: number } | null)?.seed ?? 0;
}

/**
 * Advances everything that happens on the server's clock, up to `now`: bot moves, idle human turns,
 * Bingo balls, the claim window and the automatic next round. Events are returned in order. Deterministic
 * for a given state, clock and time (bots are seeded from the match).
 */
export function advance(room: RoomRow, now: number): { room: RoomRow; events: (DominoEvent | BingoEvent)[] } {
  if (room.status !== 'playing' || !room.state) return { room, events: [] };
  const events: (DominoEvent | BingoEvent)[] = [];
  let r = room;
  const set = (state: RoomRow['state'], clock: Partial<Clock>, ev: (DominoEvent | BingoEvent)[]) => {
    r = { ...r, state, clock: { ...r.clock, ...clock } };
    events.push(...ev);
  };

  if (r.game === 'domino') {
    for (let guard = 0; guard < 60; guard++) {
      const s = r.state as DominoState;
      if (s.status === 'round_over') {
        if (now < r.clock.roundOverAt + TIMING.nextRound) break;
        const res = applyDomino(s, { type: 'NEXT_ROUND', playerId: s.players[0].id });
        if (!res.ok) break;
        set(res.state, { lastAt: r.clock.roundOverAt + TIMING.nextRound }, res.events);
        continue;
      }
      if (s.status !== 'playing') break;
      const cur = s.players[s.current];
      const bot = cur.kind === 'bot';
      const decision = decideDomino(dominoView(s, cur.id), bot ? r.settings.difficulty : 'normal', seedOf(r) + s.current);
      if (!decision) break;
      const delay = bot ? (decision.type === 'PLAY_TILE' ? 900 : 520) : TIMING.turnLimit;
      const due = r.clock.lastAt + delay;
      if (now < due) break;
      const res = applyDomino(s, decision);
      if (!res.ok) break;
      const over = res.state.status !== 'playing';
      set(res.state, { lastAt: due, ...(over ? { roundOverAt: due } : {}) }, res.events);
    }
    return { room: r, events };
  }

  const pace = TIMING.pace[r.settings.speed ?? 'normal'] ?? TIMING.pace.normal;
  for (let guard = 0; guard < 400; guard++) {
    const s = r.state as BingoState;
    if (s.status === 'round_over') {
      if (now < r.clock.roundOverAt + TIMING.nextRound) break;
      const res = applyBingo(s, { type: 'NEXT_ROUND', playerId: s.players[0].id });
      if (!res.ok) break;
      set(res.state, { lastCallAt: r.clock.roundOverAt + TIMING.nextRound - pace + TIMING.firstBall }, res.events);
      continue;
    }
    if (s.status === 'closing') {
      const due = r.clock.closingAt + TIMING.claimWindow;
      // Bots that also hold a line may still share it inside the window.
      const bot = botBingoMove(r, s, due);
      if (bot) {
        set(bot.state, {}, bot.events);
        continue;
      }
      if (now < due) break;
      const res = applyBingo(s, { type: 'CLOSE_ROUND' });
      if (!res.ok) break;
      set(res.state, { roundOverAt: due }, res.events);
      continue;
    }
    const bot = botBingoMove(r, s, now);
    if (bot) {
      set(bot.state, bot.state.status === 'closing' ? { closingAt: bot.at } : {}, bot.events);
      continue;
    }
    if (s.called.length < 75) {
      const due = r.clock.lastCallAt + pace;
      if (now < due) break;
      const res = applyBingo(s, { type: 'CALL_NUMBER' });
      if (!res.ok) break;
      // After a long idle, don't fire a burst of balls: restart the pace from now.
      set(res.state, { lastCallAt: now - due > pace ? now : due }, res.events);
      continue;
    }
    if (now < r.clock.lastCallAt + TIMING.allOut) break;
    const res = applyBingo(s, { type: 'CLOSE_ROUND' });
    if (!res.ok) break;
    set(res.state, { roundOverAt: now }, res.events);
  }
  return { room: r, events };
}

/** The first bot whose (seeded) reaction time has passed by `until`, applied. */
function botBingoMove(r: RoomRow, s: BingoState, until: number) {
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    if (p.kind !== 'bot') continue;
    const d = decideBingo(bingoView(s, p.id), r.settings.difficulty, seedOf(r) + i);
    if (!d) continue;
    const at = r.clock.lastCallAt + d.delayMs;
    if (at > until) continue;
    const res = applyBingo(s, d.action);
    if (res.ok) return { state: res.state, events: res.events, at };
  }
  return null;
}

// ---------------------------------------------------------------- requests

/** Uniform integer in [0, n) from the platform CSPRNG (rejection sampling, no modulo bias). */
function cryptoInt(n: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

function newMatch(room: RoomRow, now: number, randomInt: (n: number) => number): RoomRow {
  const seed = (randomInt(0x10000) * 0x10000 + randomInt(0x10000)) >>> 0;
  let bot = 0;
  const seats = SEATS.slice(0, room.seats).map((seat) => {
    const m = room.members.find((x) => x.seat === seat);
    return m ? { id: seat, name: m.name, kind: 'human' as const } : { id: seat, name: `Bot ${++bot}`, kind: 'bot' as const };
  });
  const state = room.game === 'domino' ? createDomino({ seats, seed, targetScore: room.settings.target ?? 100 }) : createBingo({ seats, seed });
  const clock: Clock = { lastAt: now, lastCallAt: now - (TIMING.pace[room.settings.speed ?? 'normal'] ?? 3800) + TIMING.firstBall, closingAt: 0, roundOverAt: 0 };
  return { ...room, status: 'playing', state, clock };
}

export async function handleRoomRequest(userId: string | null, body: unknown, deps: RoomDeps): Promise<RoomResponse> {
  if (!userId) return fail('unauthorized');
  if (deps.allow && !deps.allow(userId)) return fail('rate_limited');
  const req = parseRequest(body);
  if (!req) return fail('bad_request');
  const now = deps.now ?? Date.now;
  const randomInt = deps.randomInt ?? cryptoInt;

  if (req.op === 'create') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newRoomCode(randomInt);
      const members: Member[] = [{ userId, seat: 's0', name: req.name, ready: true }];
      try {
        const t = now();
        const room = await deps.store.insert({ code, game: req.game, seats: req.seats, host: userId, members, settings: req.settings }, (roomId) => [
          { userId, view: viewFor({ id: roomId, code, game: req.game, seats: req.seats, host: userId, status: 'lobby', members, settings: req.settings, state: null, clock: { lastAt: t, lastCallAt: t, closingAt: 0, roundOverAt: 0 }, version: 1 }, members[0], t) },
        ]);
        return { ok: true, view: viewFor(room, members[0], t) };
      } catch (e) {
        if (!(e instanceof RoomStoreError && e.code === 'conflict')) throw e;
      }
    }
    return fail('busy');
  }

  // Everything else changes an existing room: load, decide, commit with a version check; retry on a race.
  for (let attempt = 0; attempt < 4; attempt++) {
    const room = await deps.store.load(req.code);
    if (!room || room.status === 'closed') return fail('not_found');
    const t = now();
    const me = room.members.find((m) => m.userId === userId);
    let next: RoomRow = room;
    let events: (DominoEvent | BingoEvent)[] = [];

    switch (req.op) {
      case 'join': {
        if (me) return { ok: true, view: viewFor(room, me, t) };
        if (room.status !== 'lobby') return fail('started');
        const seat = SEATS.slice(0, room.seats).find((s) => !room.members.some((m) => m.seat === s));
        if (!seat) return fail('full');
        next = { ...room, members: [...room.members, { userId, seat, name: req.name, ready: false }] };
        break;
      }
      case 'ready':
        if (!me) return fail('not_member');
        if (room.status !== 'lobby') return fail('started');
        next = { ...room, members: room.members.map((m) => (m.userId === userId ? { ...m, ready: req.ready || m.userId === room.host } : m)) };
        break;
      case 'start':
        if (!me) return fail('not_member');
        if (room.host !== userId) return fail('not_host');
        if (room.status !== 'lobby') return fail('started');
        if (!room.members.every((m) => m.ready)) return fail('not_ready');
        next = newMatch(room, t, randomInt);
        break;
      case 'rematch': {
        if (!me) return fail('not_member');
        if (room.host !== userId) return fail('not_host');
        const over = room.state && ((room.state as DominoState).status === 'game_over' || room.game === 'bingo');
        if (room.status !== 'playing' || !over) return fail('not_playing');
        if (room.game === 'domino') {
          const seed = (randomInt(0x10000) * 0x10000 + randomInt(0x10000)) >>> 0;
          next = { ...room, state: dominoRematch(room.state as DominoState, seed), clock: { ...room.clock, lastAt: t } };
        } else next = newMatch(room, t, randomInt);
        break;
      }
      case 'leave': {
        if (!me) return fail('not_member');
        const members = room.members.filter((m) => m.userId !== userId);
        if (room.status === 'lobby') {
          // The host leaving a lobby closes the room for everyone.
          next = { ...room, members, status: room.host === userId || members.length === 0 ? 'closed' : 'lobby' };
        } else {
          // Mid-match, their seat is played by a bot from now on.
          const state = room.state ? { ...room.state, players: (room.state.players as { id: string; kind: string }[]).map((p) => (p.id === me.seat ? { ...p, kind: 'bot' } : p)) } : null;
          next = { ...room, members, state: state as RoomRow['state'], status: members.length === 0 ? 'closed' : room.status };
        }
        break;
      }
      case 'act': {
        if (!me) return fail('not_member');
        if (room.status !== 'playing' || !room.state) return fail('not_playing');
        // Catch up the clock first, so the action applies to the state everyone should be seeing now.
        const caught = advance(room, t);
        const action = room.game === 'domino' ? parseDominoAction(req.action) : parseBingoAction(req.action);
        if (!action || !('playerId' in action)) return fail('forbidden');
        if (action.playerId !== me.seat) return fail('forbidden');
        const res = room.game === 'domino' ? applyDomino(caught.room.state as DominoState, action as DominoAction) : applyBingo(caught.room.state as BingoState, action as BingoAction);
        if (!res.ok) {
          // Still persist the catch-up (if any) so everyone moves on; report the rule error.
          if (caught.events.length) {
            try {
              await deps.store.commit(caught.room, viewsFor({ ...caught.room, version: caught.room.version + 1 }, t, caught.events));
            } catch {
              /* a newer version exists; nothing lost */
            }
          }
          return fail('rule', res.error);
        }
        const prev = caught.room.state as { status: string };
        const clock: Partial<Clock> = { lastAt: t };
        const status = (res.state as { status: string }).status;
        if (room.game === 'bingo' && prev.status === 'playing' && status === 'closing') clock.closingAt = t;
        if (status === 'round_over' || status === 'game_over') clock.roundOverAt = t;
        // A new Bingo round started by a player: first ball shortly, then the usual pace.
        if (room.game === 'bingo' && res.events.some((e) => e.type === 'dealt')) clock.lastCallAt = t - (TIMING.pace[room.settings.speed ?? 'normal'] ?? 3800) + TIMING.firstBall;
        next = { ...caught.room, state: res.state, clock: { ...caught.room.clock, ...clock } };
        events = [...caught.events, ...res.events];
        const after = advance(next, t);
        next = after.room;
        events.push(...after.events);
        break;
      }
      case 'tick':
      case 'sync': {
        if (!me) return fail('not_member');
        const after = advance(room, t);
        if (!after.events.length) return { ok: true, view: viewFor(room, me, t) };
        next = after.room;
        events = after.events;
        break;
      }
    }

    try {
      const version = await deps.store.commit(next, viewsFor({ ...next, version: next.version + 1 }, t, events));
      const committed = { ...next, version };
      const self = committed.members.find((m) => m.userId === userId);
      if (!self) return { ok: true, view: viewFor({ ...committed, status: 'closed' }, me ?? { userId, seat: 's0', name: '', ready: false }, t) };
      return { ok: true, view: viewFor(committed, self, t, events) };
    } catch (e) {
      if (e instanceof RoomStoreError && e.code === 'conflict') continue;
      throw e;
    }
  }
  return fail('busy');
}
