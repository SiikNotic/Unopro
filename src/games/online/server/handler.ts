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
import type { GameState } from '@/game/engine';
import { act as bjAct, advanceBj, bjTableView, canAct as bjCanAct, canBet as bjCanBet, createBjTable, markPaid as bjMarkPaid, placeBet, unpaid as bjUnpaid } from '@/casino/table/blackjackTable';
import type { BjTable } from '@/casino/table/blackjackTable';
import { newSeed as fairSeed } from '@/casino/table/fair';
import { addBets, advanceRt, canAddBets, createRtTable, hasSlip, markPaid as rtMarkPaid, parseSlip, rtTableView, slipTotal, unpaid as rtUnpaid } from '@/casino/table/rouletteTable';
import type { RtTable } from '@/casino/table/rouletteTable';
import { advanceCarta, applyCarta, botSeat, cartaDeadline, cartaView, createCarta, parseCartaAction } from './carta';
import { applyAction as applyCartaAction } from '@/game/engine';
import { COIN_GAMES, QUICK_GAMES, SEAT_RANGE, STAKE_GAMES, STAKES } from '../protocol';
import type { PotView, RoomErrorCode, RoomGame, RoomRequest, RoomResponse, RoomSettings, RoomStatus, RoomView, Stake } from '../protocol';

export interface Member {
  userId: string;
  seat: string;
  name: string;
  ready: boolean;
  /** Last request from this player (server clock); tables drop players who stopped coming. */
  seenAt?: number;
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
  /** Staked rooms: the stakes of the current match (stored with the clock, in the room row). */
  pot?: Pot;
}

/**
 * The stakes of one match of a staked room. `nonce` is drawn by the server when the match starts, so the
 * wallet request ids of a match are unique; the payout ids derive from it and the seat, so paying the same
 * pot again (a retry, a race between two requests) is always a replay, never a second payment.
 */
export interface Pot {
  match: number;
  nonce: string;
  stake: number;
  /** Who put in a stake this match. */
  seats: { seat: string; userId: string }[];
  settled: boolean;
  /** Seats paid when the pot was settled. */
  winners: string[];
  prize: number;
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
  state: RoomState | null;
  clock: Clock;
  version: number;
}

export type RoomState = DominoState | BingoState | GameState | BjTable | RtTable;

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
  /** Quick match: an open public room of this game `userId` isn't in (room_find_open). */
  findOpen?(game: RoomGame, userId: string): Promise<string | null>;
}

export type WalletFailure = 'insufficient_funds' | 'not_registered' | 'banned' | 'conflict' | 'invalid' | 'disabled' | 'server';
export type WalletGame = 'blackjack' | 'roulette' | 'domino' | 'bingo' | 'carta';

/** Account coins at the tables and staked rooms (table_player / table_bet / table_pay). Idempotent on the request id. */
export interface TableWallet {
  player(userId: string): Promise<{ registered: boolean; banned: boolean; balance: number }>;
  bet(userId: string, requestId: string, game: WalletGame, stake: number, detail: Record<string, unknown>): Promise<{ ok: true; balance: number; replayed: boolean } | { ok: false; code: WalletFailure }>;
  pay(userId: string, requestId: string, game: WalletGame, payout: number, detail: Record<string, unknown>): Promise<{ ok: true; balance: number } | { ok: false; code: WalletFailure }>;
}

export interface RoomDeps {
  store: RoomStore;
  now?: () => number;
  /** Uniform integer in [0, n) — crypto in production. */
  randomInt?: (n: number) => number;
  allow?: (userId: string) => boolean;
  /** Required for the coin tables and staked rooms. */
  wallet?: TableWallet;
  /** Is this game in service (game_enabled)? Checked before any new match. Absent = always. */
  availability?: (game: 'domino' | 'bingo' | 'carta') => Promise<boolean>;
  /** Deterministic wallet request id for a key (SHA-256 → uuid in production). */
  requestId?: (key: string) => Promise<string>;
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
  /** Public Carta lobby: starts this long after the last player joined (2+ players)... */
  publicStart: 20000,
  /** ...or this long after it opened, with bots, if nobody else came. */
  publicSolo: 30000,
  /** A player's "still here" mark is refreshed at most this often... */
  seenEvery: 20000,
  /** ...and players unseen this long leave coin tables and Carta rooms (a bot takes a Carta seat). */
  idleDrop: 90000,
};

/**
 * Refreshes the caller's "still here" mark and drops players who closed the app without leaving (coin
 * tables and Carta; Domino and Bingo keep their players). Returns the same room when nothing changes.
 */
function maintain(room: RoomRow, userId: string, t: number): RoomRow {
  const prunes = isCoinGame(room.game) || room.game === 'carta';
  const me = room.members.find((m) => m.userId === userId);
  const touch = !!me && t - (me.seenAt ?? 0) > TIMING.seenEvery;
  const gone = prunes ? room.members.filter((m) => m.userId !== userId && m.seenAt !== undefined && t - m.seenAt > TIMING.idleDrop) : [];
  if (!touch && gone.length === 0) return room;
  const members = room.members.filter((m) => !gone.includes(m)).map((m) => (m.userId === userId ? { ...m, seenAt: t } : m));
  let state = room.state;
  if (room.game === 'carta' && room.status === 'playing' && state) for (const g of gone) state = botSeat(state as GameState, g.seat);
  const host = members.some((m) => m.userId === room.host) ? room.host : (members[0]?.userId ?? room.host);
  return { ...room, members, state, host };
}

/** Carta keeps only its latest log entries in the room (the table shows recent events). */
const CARTA_LOG = 40;
const trimCarta = (s: GameState): GameState => (s.log.length > CARTA_LOG ? { ...s, log: s.log.slice(-CARTA_LOG) } : s);

const isCoinGame = (g: RoomGame): g is 'blackjack' | 'roulette' => (COIN_GAMES as readonly string[]).includes(g);

/** A uuid from SHA-256 of `key` (the same key always gives the same id). */
export async function sha256Uuid(key: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  const h = [...d.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const fail = (code: RoomErrorCode, detail?: string): RoomResponse => ({ ok: false, code, detail });

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Drop control characters and angle brackets (names are shown as text, but keep them plain).
  const name = [...raw].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127 && ch !== '<' && ch !== '>').join('').trim().slice(0, 16);
  return name.length ? name : null;
}

function cleanSettings(game: RoomGame, raw: unknown): RoomSettings | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (isCoinGame(game)) return { difficulty: 'normal', public: r.public === true };
  if (!DIFFICULTIES.includes(r.difficulty as never)) return null;
  const difficulty = r.difficulty as RoomSettings['difficulty'];
  // A stake is one of the fixed amounts (anything else is refused, not rounded). Public rooms, found by
  // quick match, are never played for coins.
  if (r.stake !== undefined && r.stake !== 0 && !(STAKES as readonly unknown[]).includes(r.stake)) return null;
  const stake = r.public === true ? 0 : ((r.stake as Stake | undefined) ?? 0);
  const staked = stake > 0 ? { stake } : {};
  if (game === 'carta') return { difficulty, public: r.public === true, ...staked };
  if (game === 'domino') return r.target === 100 || r.target === 200 ? { difficulty, target: r.target, ...staked } : null;
  return BINGO_SPEEDS.includes(r.speed as never) ? { difficulty, speed: r.speed as RoomSettings['speed'], ...staked } : null;
}

const isStakeGame = (g: RoomGame): g is 'domino' | 'bingo' | 'carta' => (STAKE_GAMES as readonly string[]).includes(g);
/** The coins each player puts in when a match of this room starts (0 = not played for coins). */
const stakeOf = (room: Pick<RoomRow, 'game' | 'settings'>): number => (isStakeGame(room.game) ? (room.settings.stake ?? 0) : 0);

/** What the players see of the pot. */
function potView(room: RoomRow): PotView | null {
  const stake = stakeOf(room);
  if (!stake) return null;
  const p = room.clock.pot;
  if (!p) return { stake, players: 0, total: 0, settled: false, winners: [], prize: 0 };
  return { stake: p.stake, players: p.seats.length, total: p.stake * p.seats.length, settled: p.settled, winners: p.winners, prize: p.prize };
}

const GAMES: RoomGame[] = ['domino', 'bingo', 'carta', 'blackjack', 'roulette'];

/** Parses the body into a request, or null. Unknown fields are ignored; wrong types reject. */
export function parseRequest(raw: unknown): RoomRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === 'string' && ROOM_CODE_RE.test(r.code) ? r.code : null;
  switch (r.op) {
    case 'create': {
      if (!GAMES.includes(r.game as RoomGame)) return null;
      const game = r.game as RoomGame;
      const seats = r.seats;
      if (!Number.isInteger(seats) || (seats as number) < SEAT_RANGE[game].min || (seats as number) > SEAT_RANGE[game].max) return null;
      const name = cleanName(r.name);
      const settings = cleanSettings(game, r.settings);
      return name && settings ? { op: 'create', game, seats: seats as number, name, settings } : null;
    }
    case 'quick': {
      if (!(QUICK_GAMES as readonly string[]).includes(r.game as string)) return null;
      const name = cleanName(r.name);
      return name ? { op: 'quick', game: r.game as RoomGame, name } : null;
    }
    case 'join': {
      const name = cleanName(r.name);
      return code && name ? { op: 'join', code, name } : null;
    }
    case 'ready':
      return code && typeof r.ready === 'boolean' ? { op: 'ready', code, ready: r.ready } : null;
    case 'act':
      return code && r.action && typeof r.action === 'object' && !Array.isArray(r.action) ? { op: 'act', code, action: r.action as DominoAction } : null;
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

const SEATS = ['s0', 's1', 's2', 's3', 's4', 's5'];

function sanitizeEvents(game: RoomGame, events: (DominoEvent | BingoEvent)[], seat: string): (DominoEvent | BingoEvent)[] {
  if (game === 'domino') return events;
  // Which numbers someone else daubed would reveal part of their card: keep only that they daubed.
  return events.map((e) => (e.type === 'marked' && e.playerId !== seat ? { ...e, number: 0 } : e));
}

/** Public Carta lobby: when it starts by itself. */
export function autoStartAt(room: RoomRow): number | null {
  if (room.game !== 'carta' || room.status !== 'lobby' || !room.settings.public) return null;
  if (room.members.length >= room.seats) return room.clock.lastAt;
  return room.clock.lastAt + (room.members.length >= 2 ? TIMING.publicStart : TIMING.publicSolo);
}

export function viewFor(room: RoomRow, member: Member, now: number, events: (DominoEvent | BingoEvent)[] = [], balance: number | null = null): RoomView {
  const domino = room.game === 'domino' && room.state ? dominoView(room.state as DominoState, member.seat) : null;
  const bingo = room.game === 'bingo' && room.state ? bingoView(room.state as BingoState, member.seat) : null;
  const carta = room.game === 'carta' && room.state ? cartaView(room.state as GameState, member.seat) : null;
  const blackjack = room.game === 'blackjack' && room.state ? bjTableView(room.state as BjTable) : null;
  const roulette = room.game === 'roulette' && room.state ? rtTableView(room.state as RtTable) : null;
  let turnDeadline: number | null = null;
  if (domino && domino.status === 'playing') {
    const cur = (room.state as DominoState).players[(room.state as DominoState).current];
    if (cur.kind !== 'bot') turnDeadline = room.clock.lastAt + TIMING.turnLimit;
  }
  if (carta) turnDeadline = cartaDeadline(room.state as GameState, room.clock.lastAt);
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
    startsAt: autoStartAt(room),
    domino,
    bingo,
    carta,
    blackjack,
    roulette,
    pot: potView(room),
    balance,
    events: room.game === 'domino' || room.game === 'bingo' ? sanitizeEvents(room.game, events, member.seat) : [],
  };
}

const viewsFor = (room: RoomRow, now: number, events: (DominoEvent | BingoEvent)[], balances?: Map<string, number>): ViewOut[] =>
  room.members.map((m) => ({ userId: m.userId, view: viewFor(room, m, now, events, balances?.get(m.userId) ?? null) }));

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
  if (room.game === 'carta') {
    const res = advanceCarta(room.state as GameState, room.clock.lastAt, now, room.settings.difficulty);
    if (res.state === room.state) return { room, events: [] };
    return { room: { ...room, state: trimCarta(res.state), clock: { ...room.clock, lastAt: res.lastAt } }, events: [] };
  }
  if (room.game === 'blackjack') {
    const t = advanceBj(room.state as BjTable, now, room.members.map((m) => m.seat));
    return { room: t === room.state ? room : { ...room, state: t }, events: [] };
  }
  if (room.game === 'roulette') {
    const t = advanceRt(room.state as RtTable, now);
    return { room: t === room.state ? room : { ...room, state: t }, events: [] };
  }
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
      // A staked Bingo match is one round: the next one takes new stakes (the host's rematch).
      if (stakeOf(r) > 0) break;
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

function newSeed(randomInt: (n: number) => number): number {
  return (randomInt(0x10000) * 0x10000 + randomInt(0x10000)) >>> 0;
}

function newMatch(room: RoomRow, now: number, randomInt: (n: number) => number): RoomRow {
  const seed = newSeed(randomInt);
  let bot = 0;
  const seats = SEATS.slice(0, room.seats).map((seat) => {
    const m = room.members.find((x) => x.seat === seat);
    return m ? { id: seat, name: m.name, kind: 'human' as const } : { id: seat, name: `Bot ${++bot}`, kind: 'bot' as const };
  });
  if (room.game === 'carta') return { ...room, status: 'playing', state: createCarta(seats, seed), clock: { lastAt: now, lastCallAt: 0, closingAt: 0, roundOverAt: 0 } };
  const state = room.game === 'domino' ? createDomino({ seats, seed, targetScore: room.settings.target ?? 100 }) : createBingo({ seats, seed });
  const clock: Clock = { lastAt: now, lastCallAt: now - (TIMING.pace[room.settings.speed ?? 'normal'] ?? 3800) + TIMING.firstBall, closingAt: 0, roundOverAt: 0 };
  return { ...room, status: 'playing', state, clock };
}

/** A coin table opens already running (players sit down and bet whenever a round is open). */
function newTable(room: RoomRow, now: number): RoomRow {
  const seed = fairSeed();
  const state = room.game === 'blackjack' ? createBjTable(seed, now) : createRtTable(seed, now);
  return { ...room, status: 'playing', state, clock: { lastAt: now, lastCallAt: 0, closingAt: 0, roundOverAt: 0 } };
}

const idFor = (deps: RoomDeps) => deps.requestId ?? sha256Uuid;

/** Credits every settled win of a coin table (idempotent ids), marking each seat paid. */
async function payOut(room: RoomRow, deps: RoomDeps, balances: Map<string, number>): Promise<RoomRow> {
  if (!room.state || !isCoinGame(room.game) || !deps.wallet) return room;
  let state = room.state as BjTable | RtTable;
  const owed = state.kind === 'blackjack' ? bjUnpaid(state) : rtUnpaid(state);
  for (const s of owed) {
    const id = await idFor(deps)(`${room.id}|${state.round}|${s.seat}|payout`);
    const res = await deps.wallet.pay(s.userId, id, room.game, s.payout, { room: room.code, round: state.round, seat: s.seat });
    if (!res.ok) continue; // tried again on the next request
    balances.set(s.userId, res.balance);
    state = state.kind === 'blackjack' ? bjMarkPaid(state, s.seat) : rtMarkPaid(state as RtTable, s.seat);
  }
  return state === room.state ? room : { ...room, state };
}

/** advance + payouts, until nothing more happens at `now`. */
async function progress(room: RoomRow, now: number, deps: RoomDeps, balances: Map<string, number>): Promise<{ room: RoomRow; events: (DominoEvent | BingoEvent)[] }> {
  let r = room;
  const events: (DominoEvent | BingoEvent)[] = [];
  for (let i = 0; i < 6; i++) {
    const a = advance(r, now);
    events.push(...a.events);
    const paid = await payOut(a.room, deps, balances);
    const moved = paid !== r;
    r = paid;
    if (!moved || paid === a.room) break;
  }
  return { room: r, events };
}

const walletError = (code: WalletFailure, detail?: string): RoomResponse =>
  code === 'insufficient_funds' || code === 'not_registered' || code === 'banned' || code === 'disabled' ? fail(code, detail) : code === 'conflict' || code === 'invalid' ? fail('rule', code) : fail('busy');

/** Refused when the owner has taken the game out of service (only new matches; running ones finish). */
async function outOfService(game: RoomGame, deps: RoomDeps): Promise<RoomResponse | null> {
  if (!isStakeGame(game) || !deps.availability) return null;
  return (await deps.availability(game)) ? null : fail('disabled');
}

/** Coins taken by this request that must be given back if what they paid for doesn't happen. */
type Debit = { userId: string; id: string; amount: number; game: WalletGame };

async function giveBack(debits: Debit[], deps: RoomDeps, code: string, balances: Map<string, number>) {
  if (!deps.wallet) return;
  for (const d of debits.splice(0)) {
    const res = await deps.wallet.pay(d.userId, await idFor(deps)(`${d.id}|refund`), d.game, d.amount, { room: code, refund: true });
    if (res.ok) balances.set(d.userId, res.balance);
  }
}

/**
 * Starts the stakes of a new match: every player at the table puts in the room's stake, taken from their
 * account wallet by the database (balance checked there, under a row lock). If anyone can't pay, the
 * stakes already taken are given back and the match doesn't start. Needs two or more players.
 */
async function collectStakes(room: RoomRow, deps: RoomDeps, randomInt: (n: number) => number, balances: Map<string, number>, debits: Debit[]): Promise<{ ok: true; room: RoomRow } | { ok: false; res: RoomResponse }> {
  const stake = stakeOf(room);
  if (!stake) return { ok: true, room };
  const game = room.game as 'domino' | 'bingo' | 'carta';
  if (!deps.wallet) return { ok: false, res: fail('not_registered') };
  if (room.members.length < 2) return { ok: false, res: fail('need_players') };
  const match = (room.clock.pot?.match ?? 0) + 1;
  const nonce = [newSeed(randomInt), newSeed(randomInt)].map((n) => n.toString(16).padStart(8, '0')).join('');
  const taken: Debit[] = [];
  for (const m of room.members) {
    const id = await idFor(deps)(`${room.id}|pot|${match}|${nonce}|${m.seat}|stake`);
    const res = await deps.wallet.bet(m.userId, id, game, stake, { room: room.code, match, seat: m.seat, kind: 'stake' });
    if (!res.ok) {
      await giveBack(taken, deps, room.code, balances);
      return { ok: false, res: walletError(res.code, m.name) };
    }
    balances.set(m.userId, res.balance);
    taken.push({ userId: m.userId, id, amount: stake, game });
  }
  debits.push(...taken);
  const pot: Pot = { match, nonce, stake, seats: room.members.map((m) => ({ seat: m.seat, userId: m.userId })), settled: false, winners: [], prize: 0 };
  return { ok: true, room: { ...room, clock: { ...room.clock, pot } } };
}

/** The seats that won the match, once it is over (null while it's still being played). */
export function matchWinners(room: RoomRow): string[] | null {
  const st = room.state;
  if (room.status !== 'playing' || !st) return null;
  if (room.game === 'domino') {
    const d = st as DominoState;
    return d.status === 'game_over' ? d.matchWinners : null;
  }
  if (room.game === 'bingo') {
    const b = st as BingoState;
    return b.status === 'round_over' ? (b.lastResult?.winners ?? []) : null;
  }
  if (room.game === 'carta') {
    const c = st as GameState;
    if (c.status !== 'GAME_OVER') return null;
    if (c.gameWinnerTeamId) return c.players.filter((p) => p.teamId === c.gameWinnerTeamId).map((p) => p.id);
    return c.gameWinnerId ? [c.gameWinnerId] : [];
  }
  return null;
}

/**
 * Pays the pot of a finished match: split evenly between the winning seats whose player put in a stake and
 * is still at the table (the remainder, if any, to the first). A seat won by a bot or by someone who left
 * pays nobody; the stakes of the losers stay lost. Payout ids derive from the pot and the seat, so a repeat
 * is a replay in the database. If a payment fails the pot stays unsettled and is tried again next request.
 */
async function settlePot(room: RoomRow, deps: RoomDeps, balances: Map<string, number>): Promise<RoomRow> {
  const pot = room.clock.pot;
  if (!pot || pot.settled || !deps.wallet) return room;
  const won = matchWinners(room);
  if (won === null) return room;
  const game = room.game as 'domino' | 'bingo' | 'carta';
  const winners = pot.seats.filter((s) => won.includes(s.seat) && room.members.some((m) => m.userId === s.userId && m.seat === s.seat));
  const total = pot.stake * pot.seats.length;
  const each = winners.length ? Math.floor(total / winners.length) : 0;
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const amount = each + (i === 0 ? total - each * winners.length : 0);
    const id = await idFor(deps)(`${room.id}|pot|${pot.match}|${pot.nonce}|${w.seat}|win`);
    const res = await deps.wallet.pay(w.userId, id, game, amount, { room: room.code, match: pot.match, seat: w.seat, kind: 'pot' });
    if (!res.ok) return room;
    balances.set(w.userId, res.balance);
  }
  return { ...room, clock: { ...room.clock, pot: { ...pot, settled: true, winners: winners.map((w) => w.seat), prize: each } } };
}

/** Registered, not banned: required to sit at a coin table. */
async function mayPlayForCoins(userId: string, deps: RoomDeps): Promise<RoomResponse | null> {
  if (!deps.wallet) return fail('not_registered');
  const p = await deps.wallet.player(userId);
  if (!p.registered) return fail('not_registered');
  if (p.banned) return fail('banned');
  return null;
}

type Decision =
  | { kind: 'fail'; res: RoomResponse }
  | { kind: 'same' }
  | { kind: 'next'; room: RoomRow; events?: (DominoEvent | BingoEvent)[] };

/**
 * One action at a coin table. Bets and doubles take the coins first (idempotent request id derived from
 * the room, round, seat and slip), then join the table state; `debited` records coins already taken by an
 * earlier attempt of this same request so they can be refunded if the table moved on meanwhile.
 */
async function tableAction(room: RoomRow, me: Member, raw: Record<string, unknown>, t: number, deps: RoomDeps, balances: Map<string, number>, debited: { id: string; amount: number }[]): Promise<Decision> {
  const wallet = deps.wallet;
  if (!wallet) return { kind: 'fail', res: fail('not_registered') };
  const game = room.game as 'blackjack' | 'roulette';
  const state = room.state as BjTable | RtTable;
  const take = async (key: string, amount: number, detail: Record<string, unknown>): Promise<RoomResponse | null> => {
    const id = await idFor(deps)(key);
    const res = await wallet.bet(me.userId, id, game, amount, { room: room.code, round: state.round, seat: me.seat, ...detail });
    if (!res.ok) return walletError(res.code);
    balances.set(me.userId, res.balance);
    if (!debited.some((d) => d.id === id)) debited.push({ id, amount });
    return null;
  };

  if (state.kind === 'blackjack') {
    const type = raw.type;
    if (type === 'BET') {
      const amount = raw.amount as number;
      const err = bjCanBet(state, me.seat, amount);
      if (err === 'already_bet') return { kind: 'same' };
      if (err) return { kind: 'fail', res: fail('rule', err) };
      const failed = await take(`${room.id}|${state.round}|${me.seat}|bet`, amount, { kind: 'bet' });
      if (failed) return { kind: 'fail', res: failed };
      return { kind: 'next', room: { ...room, state: placeBet(state, me.seat, me.userId, me.name, amount, t) } };
    }
    if (type === 'HIT' || type === 'STAND' || type === 'DOUBLE') {
      const action = type === 'HIT' ? 'hit' : type === 'STAND' ? 'stand' : 'double';
      const err = bjCanAct(state, me.seat, action);
      if (err) return { kind: 'fail', res: fail('rule', err) };
      if (action === 'double') {
        const extra = state.seats[state.turn].bet;
        const failed = await take(`${room.id}|${state.round}|${me.seat}|double`, extra, { kind: 'double' });
        if (failed) return { kind: 'fail', res: failed };
      }
      return { kind: 'next', room: { ...room, state: bjAct(state, me.seat, action, t) } };
    }
    return { kind: 'fail', res: fail('bad_request') };
  }

  if (raw.type !== 'BET') return { kind: 'fail', res: fail('bad_request') };
  const bets = parseSlip(raw.bets);
  const slipId = typeof raw.slipId === 'string' && /^[0-9a-f-]{8,40}$/i.test(raw.slipId) ? raw.slipId.toLowerCase() : null;
  if (!bets || !slipId) return { kind: 'fail', res: fail('bad_request') };
  if (hasSlip(state, me.seat, slipId)) return { kind: 'same' };
  const err = canAddBets(state, me.seat, bets);
  if (err) return { kind: 'fail', res: fail('rule', err) };
  const failed = await take(`${room.id}|${state.round}|${me.seat}|slip|${slipId}`, slipTotal(bets), { kind: 'bet', bets });
  if (failed) return { kind: 'fail', res: failed };
  return { kind: 'next', room: { ...room, state: addBets(state, me.seat, me.userId, me.name, bets, t, slipId) } };
}

export async function handleRoomRequest(userId: string | null, body: unknown, deps: RoomDeps): Promise<RoomResponse> {
  if (!userId) return fail('unauthorized');
  if (deps.allow && !deps.allow(userId)) return fail('rate_limited');
  const req = parseRequest(body);
  if (!req) return fail('bad_request');
  const now = deps.now ?? Date.now;
  const randomInt = deps.randomInt ?? cryptoInt;

  if (req.op === 'quick') {
    const off = await outOfService(req.game, deps);
    if (off) return off;
    if (isCoinGame(req.game)) {
      const refused = await mayPlayForCoins(userId, deps);
      if (refused) return refused;
    }
    for (let attempt = 0; attempt < 3 && deps.store.findOpen; attempt++) {
      const code = await deps.store.findOpen(req.game, userId);
      if (!code) break;
      const res = await handleRoomRequest(userId, { op: 'join', code, name: req.name }, { ...deps, allow: undefined });
      if (res.ok || !['full', 'started', 'not_found'].includes(res.code)) return res;
    }
    const settings: RoomSettings = { difficulty: 'normal', public: true };
    return handleRoomRequest(userId, { op: 'create', game: req.game, seats: SEAT_RANGE[req.game].quick, name: req.name, settings }, { ...deps, allow: undefined });
  }

  if (req.op === 'create') {
    const off = await outOfService(req.game, deps);
    if (off) return off;
    // Coin tables and staked rooms: a registered, non-banned account (the database checks it again).
    if (isCoinGame(req.game) || stakeOf(req) > 0) {
      const refused = await mayPlayForCoins(userId, deps);
      if (refused) return refused;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newRoomCode(randomInt);
      const members: Member[] = [{ userId, seat: 's0', name: req.name, ready: true, seenAt: now() }];
      try {
        const t = now();
        const room = await deps.store.insert({ code, game: req.game, seats: req.seats, host: userId, members, settings: req.settings }, (roomId) => [
          { userId, view: viewFor({ id: roomId, code, game: req.game, seats: req.seats, host: userId, status: 'lobby', members, settings: req.settings, state: null, clock: { lastAt: t, lastCallAt: t, closingAt: 0, roundOverAt: 0 }, version: 1 }, members[0], t) },
        ]);
        const opened: RoomRow = { ...room, clock: { lastAt: t, lastCallAt: t, closingAt: 0, roundOverAt: 0 } };
        // Coin tables and public Carta rooms need their first state / timer stored right away.
        if (isCoinGame(req.game) || (req.game === 'carta' && req.settings.public)) {
          const next = isCoinGame(req.game) ? newTable(opened, t) : opened;
          const version = await deps.store.commit(next, viewsFor({ ...next, version: next.version + 1 }, t, []));
          return { ok: true, view: viewFor({ ...next, version }, members[0], t) };
        }
        return { ok: true, view: viewFor(opened, members[0], t) };
      } catch (e) {
        if (!(e instanceof RoomStoreError && e.code === 'conflict')) throw e;
      }
    }
    return fail('busy');
  }

  // Everything else changes an existing room: load, decide, commit with a version check; retry on a race.
  const balances = new Map<string, number>();
  const debited: { id: string; amount: number }[] = [];
  // Stakes taken for a match this request is starting; given back if the start isn't committed.
  const stakes: Debit[] = [];
  const refund = async (room: RoomRow) => {
    // Coins taken by an earlier attempt of this request that couldn't join the table: give them back.
    if (!deps.wallet || !debited.length) return;
    for (const d of debited) {
      const res = await deps.wallet.pay(userId, await idFor(deps)(`${d.id}|refund`), room.game as 'blackjack' | 'roulette', d.amount, { room: room.code, refund: true });
      if (res.ok) balances.set(userId, res.balance);
    }
    debited.length = 0;
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await deps.store.load(req.code);
    if (!loaded || loaded.status === 'closed') return fail('not_found');
    const t = now();
    const room = maintain(loaded, userId, t);
    const dirty = room !== loaded;
    const me = room.members.find((m) => m.userId === userId);
    let next: RoomRow = room;
    let events: (DominoEvent | BingoEvent)[] = [];

    switch (req.op) {
      case 'join': {
        if (me) return { ok: true, view: viewFor(room, me, t) };
        const coin = isCoinGame(room.game);
        if (!coin) {
          if (room.status !== 'lobby') return fail('started');
          const off = await outOfService(room.game, deps);
          if (off) return off;
        }
        if (coin || stakeOf(room) > 0) {
          const refused = await mayPlayForCoins(userId, deps);
          if (refused) return refused;
        }
        const seat = SEATS.slice(0, room.seats).find((s) => !room.members.some((m) => m.seat === s));
        if (!seat) return fail('full');
        const auto = coin || !!room.settings.public;
        next = { ...room, members: [...room.members, { userId, seat, name: req.name, ready: auto, seenAt: t }], clock: room.game === 'carta' && room.settings.public ? { ...room.clock, lastAt: t } : room.clock };
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
        {
          const off = await outOfService(room.game, deps);
          if (off) return off;
          const staked = await collectStakes(newMatch(room, t, randomInt), deps, randomInt, balances, stakes);
          if (!staked.ok) return staked.res;
          next = staked.room;
        }
        break;
      case 'rematch': {
        if (!me) return fail('not_member');
        if (room.host !== userId) return fail('not_host');
        if (!isCoinGame(room.game)) {
          const off = await outOfService(room.game, deps);
          if (off) return off;
          // The last pot is paid before a new match can take new stakes.
          if (room.clock.pot && !room.clock.pot.settled) return fail('rule', 'pot_open');
        }
        if (room.game === 'carta') {
          const s = room.state as GameState | null;
          if (room.status !== 'playing' || !s || s.status !== 'GAME_OVER') return fail('not_playing');
          const res = applyCartaAction(s, { type: 'RESTART_GAME', timestamp: t });
          if (!res.ok) return fail('rule', res.error);
          next = { ...room, state: trimCarta(res.state), clock: { ...room.clock, lastAt: t } };
        } else {
          if (isCoinGame(room.game)) return fail('not_playing');
        const over = room.state && ((room.state as DominoState).status === 'game_over' || room.game === 'bingo');
        if (room.status !== 'playing' || !over) return fail('not_playing');
          if (room.game === 'domino') {
            next = { ...room, state: dominoRematch(room.state as DominoState, newSeed(randomInt)), clock: { ...room.clock, lastAt: t } };
          } else {
            const fresh = newMatch(room, t, randomInt);
            next = { ...fresh, clock: { ...fresh.clock, pot: room.clock.pot } };
          }
        }
        {
          const staked = await collectStakes(next, deps, randomInt, balances, stakes);
          if (!staked.ok) return staked.res;
          next = staked.room;
        }
        break;
      }
      case 'leave': {
        if (!me) return fail('not_member');
        const members = room.members.filter((m) => m.userId !== userId);
        if (isCoinGame(room.game)) {
          // Their bets stay on the table and are settled and paid to them. The last one out settles the
          // round at once (nobody would be left to move the clock).
          let left: RoomRow = { ...room, members };
          if (members.length === 0) {
            for (let i = 0; i < 10; i++) {
              const phase = (left.state as BjTable | RtTable | null)?.phase;
              if (!phase || phase === 'waiting') break;
              left = (await progress(left, t + (i + 1) * 3600_000, deps, balances)).room;
            }
            left = { ...left, status: 'closed' };
          }
          next = left;
        } else if (room.status === 'lobby') {
          // The host leaving a private lobby closes the room for everyone; a public one keeps going.
          const hostLeft = room.host === userId;
          const host = hostLeft && room.settings.public && members.length ? members[0].userId : room.host;
          next = { ...room, members, host, status: (hostLeft && !room.settings.public) || members.length === 0 ? 'closed' : 'lobby' };
        } else if (room.game === 'carta') {
          next = { ...room, members, state: room.state ? botSeat(room.state as GameState, me.seat) : null, status: members.length === 0 ? 'closed' : room.status };
        } else {
          // Mid-match, their seat is played by a bot from now on.
          const state = room.state ? { ...room.state, players: ((room.state as DominoState).players as { id: string; kind: string }[]).map((p) => (p.id === me.seat ? { ...p, kind: 'bot' } : p)) } : null;
          next = { ...room, members, state: state as RoomRow['state'], status: members.length === 0 ? 'closed' : room.status };
        }
        break;
      }
      case 'act': {
        if (!me) return fail('not_member');
        if (room.status !== 'playing' || !room.state) return fail('not_playing');
        // Catch up the clock first, so the action applies to the state everyone should be seeing now.
        const caught = await progress(room, t, deps, balances);
        if (isCoinGame(room.game)) {
          const d = await tableAction(caught.room, me, req.action as Record<string, unknown>, t, deps, balances, debited);
          if (d.kind === 'fail') {
            await refund(room);
            return d.res;
          }
          if (d.kind === 'same') {
            // Already on the table (a repeated request): nothing new to take or add.
            debited.length = 0;
            next = caught.room;
            if (next === room && !dirty) return { ok: true, view: viewFor(room, me, t, [], balances.get(userId) ?? null) };
            break;
          }
          const after = await progress(d.room, t, deps, balances);
          next = after.room;
          break;
        }
        if (room.game === 'carta') {
          const action = parseCartaAction(req.action, me.seat);
          if (!action) return fail('forbidden');
          const res = applyCarta(caught.room.state as GameState, action, t);
          if (!res.ok) {
            if (caught.room !== room) {
              try {
                await deps.store.commit(caught.room, viewsFor({ ...caught.room, version: caught.room.version + 1 }, t, []));
              } catch {
                /* a newer version exists; nothing lost */
              }
            }
            return fail('rule', res.error);
          }
          const moved = { ...caught.room, state: trimCarta(res.state), clock: { ...caught.room.clock, lastAt: t } };
          next = advance(moved, t).room;
          break;
        }
        const action = room.game === 'domino' ? parseDominoAction(req.action) : parseBingoAction(req.action);
        if (!action || !('playerId' in action)) return fail('forbidden');
        if (action.playerId !== me.seat) return fail('forbidden');
        // A staked Bingo match is one round: a new round takes new stakes (the host's rematch).
        if (room.game === 'bingo' && action.type === 'NEXT_ROUND' && stakeOf(room) > 0) return fail('rule', 'stake_rematch');
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
        next = { ...caught.room, state: res.state as RoomState, clock: { ...caught.room.clock, ...clock } };
        events = [...caught.events, ...res.events];
        const after = advance(next, t);
        next = after.room;
        events.push(...after.events);
        break;
      }
      case 'tick':
      case 'sync': {
        if (!me) return fail('not_member');
        // A public Carta lobby starts by itself.
        const startAt = autoStartAt(room);
        if (startAt !== null && t >= startAt) {
          next = newMatch({ ...room, members: room.members.map((m) => ({ ...m, ready: true })) }, t, randomInt);
          break;
        }
        const after = await progress(room, t, deps, balances);
        const paid = await settlePot(after.room, deps, balances);
        if (paid === room && !dirty) return { ok: true, view: viewFor(room, me, t, [], balances.get(userId) ?? null) };
        next = paid;
        events = after.events;
        break;
      }
    }

    // A match that just ended pays its pot before the new state is stored.
    next = await settlePot(next, deps, balances);
    try {
      const version = await deps.store.commit(next, viewsFor({ ...next, version: next.version + 1 }, t, events, balances));
      stakes.length = 0;
      const committed = { ...next, version };
      const self = committed.members.find((m) => m.userId === userId);
      if (!self) return { ok: true, view: viewFor({ ...committed, status: 'closed' }, me ?? { userId, seat: 's0', name: '', ready: false }, t) };
      return { ok: true, view: viewFor(committed, self, t, events, balances.get(userId) ?? null) };
    } catch (e) {
      // The start didn't happen: the stakes this attempt took go back (a retry draws a new pot).
      await giveBack(stakes, deps, req.code, balances);
      if (e instanceof RoomStoreError && e.code === 'conflict') continue;
      throw e;
    }
  }
  if (debited.length) {
    const room = await deps.store.load(req.code);
    if (room) await refund(room);
  }
  return fail('busy');
}
