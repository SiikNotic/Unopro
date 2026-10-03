// 8-Ball rules as an explicit state machine. The physics decides where the balls go; this file decides what
// the shot means: legal or foul, who shoots next, the groups, ball in hand, and the end of the game. Pure and
// deterministic (the online server runs exactly this), with no clocks and no randomness after the rack.
//
//   break ──▶ open ──▶ assigned ──▶ over
//              (table open until someone legally pockets a ball after the break; the 8 decides the game)
//
// Rules (standard 8-Ball, as played online):
//   - The breaker shoots from behind the head string. The break is a foul if the cue ball drops, if it
//     touches nothing, or if no ball drops and fewer than four object balls reach a cushion. An 8 pocketed
//     on the break is spotted back on the foot spot; the table stays open after the break.
//   - Then each shot must first hit a ball of your group (any ball but the 8 while the table is open; the 8
//     once your group is cleared), and after that contact something must drop or some ball must touch a
//     cushion. The cue ball must not drop.
//   - Open table: the first legally pocketed ball gives you its group (if both kinds drop, the first one).
//   - You keep shooting while you legally pocket your own balls. A foul gives the opponent ball in hand
//     anywhere on the table. Pocketed object balls stay down, even on a foul.
//   - The 8: pocketing it legally, in the pocket you called, once your group is cleared, wins. Pocketing it
//     early, with a foul, or in another pocket loses.
import { BALL_D, BALL_R, FOOT_SPOT, HEAD_SPOT, POCKETS, TABLE_W, groupOf, inGroup, onCloth, rackPositions } from './table';
import type { Group } from './table';
import { simulate } from './physics';
import type { BallState, ShotInput, ShotResult } from './physics';
import { createRng, shuffle } from '@/games/shared/rng';

export type Phase = 'break' | 'open' | 'assigned' | 'over';
export type Foul = 'scratch' | 'no_contact' | 'wrong_ball' | 'no_rail' | 'bad_break' | 'timeout';
export type EndReason = 'eight' | 'eight_early' | 'eight_foul' | 'eight_wrong_pocket' | 'forfeit';
export type PlayerKind = 'human' | 'bot';

export interface BilliardsPlayer {
  id: string;
  name: string;
  kind: PlayerKind;
  group: Group | null;
  /** Own balls pocketed this game. */
  potted: number;
  fouls: number;
}

/** What a player sends: aim, power, spin, and where the cue ball goes when they have it in hand. */
export interface Shot {
  dx: number;
  dy: number;
  power: number;
  spinX?: number;
  spinY?: number;
  /** With ball in hand: where to place the cue ball. */
  cueX?: number;
  cueY?: number;
  /** The pocket called for the 8 (0–5). Required when shooting at the 8. */
  pocket?: number;
}

/** The last shot as everyone replays it: the balls before it, the exact input, and what it meant. */
export interface LastShot {
  no: number;
  by: number;
  before: BallState[];
  input: ShotInput;
  potted: number[];
  foul: Foul | null;
  /** The shooter keeps the table. */
  again: boolean;
  /** A group was just given. */
  assigned: Group | null;
}

export interface BilliardsState {
  v: 1;
  seed: number;
  match: number;
  balls: BallState[];
  players: [BilliardsPlayer, BilliardsPlayer];
  turn: 0 | 1;
  breaker: 0 | 1;
  phase: Phase;
  /** The player to shoot may place the cue ball (anywhere; behind the head string on the break). */
  ballInHand: boolean;
  shots: number;
  winner: 0 | 1 | null;
  reason: EndReason | null;
  last: LastShot | null;
}

export type ApplyResult = { ok: true; state: BilliardsState; result: ShotResult | null } | { ok: false; error: string };

/** The step names the screen and the docs use for where the game is. */
export type Stage = 'BREAK' | 'OPEN_TABLE' | 'PLAYER_GROUP_ASSIGNED' | 'BALL_IN_HAND' | 'EIGHT_BALL' | 'GAME_OVER';

export function stageOf(s: BilliardsState): Stage {
  if (s.phase === 'over') return 'GAME_OVER';
  if (s.phase === 'break') return 'BREAK';
  if (s.ballInHand) return 'BALL_IN_HAND';
  if (s.phase === 'open') return 'OPEN_TABLE';
  return onEight(s, s.turn) ? 'EIGHT_BALL' : 'PLAYER_GROUP_ASSIGNED';
}

/** A new game: the rack (8 in the centre, a solid and a stripe in the back corners, the rest shuffled). */
export function createBilliards(players: { id: string; name: string; kind: PlayerKind }[], seed: number, breaker: 0 | 1 = 0, match = 1): BilliardsState {
  if (players.length !== 2) throw new Error('8-Ball needs two players');
  const rng = createRng(seed >>> 0);
  const spots = rackPositions();
  // Back row corners are indices 10 and 14; the centre (third row, middle) is index 4.
  const solidCorner = 10 + (rng.next() < 0.5 ? 0 : 4);
  const stripeCorner = solidCorner === 10 ? 14 : 10;
  const solids = shuffle([1, 2, 3, 4, 5, 6, 7], rng);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15], rng);
  const rack: number[] = new Array(15);
  rack[4] = 8;
  rack[solidCorner] = solids.pop()!;
  rack[stripeCorner] = stripes.pop()!;
  const rest = shuffle([...solids, ...stripes], rng);
  for (let i = 0; i < 15; i++) if (rack[i] === undefined) rack[i] = rest.pop()!;
  const balls: BallState[] = [{ id: 0, x: HEAD_SPOT.x, y: HEAD_SPOT.y, down: false }, ...rack.map((id, i) => ({ id, x: spots[i].x, y: spots[i].y, down: false }))];
  balls.sort((a, b) => a.id - b.id);
  return {
    v: 1,
    seed: seed >>> 0,
    match,
    balls,
    players: [mkPlayer(players[0]), mkPlayer(players[1])],
    turn: breaker,
    breaker,
    phase: 'break',
    ballInHand: true,
    shots: 0,
    winner: null,
    reason: null,
    last: null,
  };
}

const mkPlayer = (p: { id: string; name: string; kind: PlayerKind }): BilliardsPlayer => ({ id: p.id, name: p.name, kind: p.kind, group: null, potted: 0, fouls: 0 });

/** The same players, a new rack, the other player breaks. */
export function rematchBilliards(s: BilliardsState, seed: number): BilliardsState {
  const players = s.players.map((p) => ({ id: p.id, name: p.name, kind: p.kind }));
  return createBilliards(players, seed, s.breaker === 0 ? 1 : 0, s.match + 1);
}

export const ballOf = (s: BilliardsState, id: number) => s.balls.find((b) => b.id === id)!;

/** Object balls of a group still on the table. */
export function remaining(s: BilliardsState, g: Group): number {
  return s.balls.filter((b) => !b.down && inGroup(b.id, g)).length;
}

/** Is this player shooting at the 8 (group assigned and cleared)? */
export function onEight(s: BilliardsState, seat: 0 | 1): boolean {
  const g = s.players[seat].group;
  return !!g && remaining(s, g) === 0;
}

/** Balls this player may legally hit first. */
export function legalTargets(s: BilliardsState, seat: 0 | 1 = s.turn): number[] {
  const live = s.balls.filter((b) => !b.down && b.id !== 0).map((b) => b.id);
  if (s.phase === 'break' || s.phase === 'open') return live.filter((id) => id !== 8);
  const g = s.players[seat].group!;
  if (remaining(s, g) === 0) return [8];
  return live.filter((id) => inGroup(id, g));
}

/** Rounds a shot to the grid every side uses, and checks its numbers. */
export function normalizeShot(raw: Shot): ShotInput | null {
  const { dx, dy, power } = raw;
  if (![dx, dy, power].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return null;
  const q = (v: number, step: number) => Math.round(v / step) * step;
  const clampSpin = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, q(v, 0.01))) : 0);
  return {
    dx: q(dx / len, 1e-6),
    dy: q(dy / len, 1e-6),
    power: Math.max(0, Math.min(1, q(power, 0.001))),
    spinX: clampSpin(raw.spinX),
    spinY: clampSpin(raw.spinY),
  };
}

/** Can the cue ball be put at (x, y) now? */
export function canPlaceCue(s: BilliardsState, x: number, y: number): boolean {
  if (!onCloth(x, y, s.phase === 'break')) return false;
  return s.balls.every((b) => b.id === 0 || b.down || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) >= BALL_D * BALL_D);
}

/** Validates a shot for the player to move and returns the start position and input the physics will use. */
export function prepareShot(s: BilliardsState, shot: Shot): { ok: true; before: BallState[]; input: ShotInput } | { ok: false; error: string } {
  if (s.phase === 'over') return { ok: false, error: 'game_over' };
  const input = normalizeShot(shot);
  if (!input) return { ok: false, error: 'bad_shot' };
  let before = s.balls.map((b) => ({ ...b }));
  if (shot.cueX !== undefined || shot.cueY !== undefined) {
    if (!s.ballInHand) return { ok: false, error: 'no_ball_in_hand' };
    const x = Math.round(Number(shot.cueX) * 100) / 100;
    const y = Math.round(Number(shot.cueY) * 100) / 100;
    if (!canPlaceCue(s, x, y)) return { ok: false, error: 'bad_cue_position' };
    before = before.map((b) => (b.id === 0 ? { id: 0, x, y, down: false } : b));
  }
  if (onEight(s, s.turn)) {
    if (!Number.isInteger(shot.pocket) || shot.pocket! < 0 || shot.pocket! >= POCKETS.length) return { ok: false, error: 'call_pocket' };
  }
  return { ok: true, before, input };
}

/** Plays a shot for the player to move: physics, then the rules. */
export function applyShot(s: BilliardsState, shot: Shot): ApplyResult {
  const prep = prepareShot(s, shot);
  if (!prep.ok) return prep;
  const result = simulate(prep.before, prep.input);
  return { ok: true, state: judge(s, prep.before, prep.input, result, shot.pocket), result };
}

/** What a finished shot means. Exported for the tests. */
export function judge(s: BilliardsState, before: BallState[], input: ShotInput, r: ShotResult, calledPocket?: number): BilliardsState {
  const me = s.turn;
  const other: 0 | 1 = me === 0 ? 1 : 0;
  const shooter = s.players[me];
  const ids = r.potted.map((p) => p.ball);
  const cueDown = ids.includes(0);
  const eight = r.potted.find((p) => p.ball === 8);
  const objects = ids.filter((id) => id !== 0 && id !== 8);
  const wasOnEight = onEight(s, me);
  const targets = legalTargets(s, me);
  let balls = r.balls.map((b) => ({ ...b }));
  let foul: Foul | null = null;
  let phase: Phase = s.phase;
  let players: [BilliardsPlayer, BilliardsPlayer] = [{ ...s.players[0] }, { ...s.players[1] }];
  let assigned: Group | null = null;
  let again = false;

  if (s.phase === 'break') {
    if (cueDown) foul = 'scratch';
    else if (r.firstContact === null) foul = 'no_contact';
    else if (ids.filter((id) => id !== 0).length === 0 && r.objectRails < 4) foul = 'bad_break';
    if (eight) balls = spotEight(balls);
    phase = 'open';
    again = !foul && ids.some((id) => id !== 0);
  } else {
    if (r.firstContact === null) foul = 'no_contact';
    else if (!targets.includes(r.firstContact)) foul = 'wrong_ball';
    else if (cueDown) foul = 'scratch';
    else if (ids.length === 0 && !r.railAfterContact) foul = 'no_rail';
    if (cueDown && !foul) foul = 'scratch';

    if (eight) {
      const rightPocket = calledPocket === undefined || calledPocket === eight.pocket;
      const win = wasOnEight && !foul && rightPocket;
      const reason: EndReason = win ? 'eight' : !wasOnEight ? 'eight_early' : foul ? 'eight_foul' : 'eight_wrong_pocket';
      players = credit(players, me, objects, shooter.group, foul);
      return {
        ...s,
        balls,
        players,
        phase: 'over',
        ballInHand: false,
        shots: s.shots + 1,
        winner: win ? me : other,
        reason,
        last: { no: s.shots + 1, by: me, before, input, potted: ids, foul, again: false, assigned: null },
      };
    }

    if (s.phase === 'open' && !foul && objects.length > 0) {
      assigned = groupOf(objects[0])!;
      players[me] = { ...players[me], group: assigned };
      players[other] = { ...players[other], group: assigned === 'solids' ? 'stripes' : 'solids' };
      phase = 'assigned';
    }
    const myGroup = players[me].group;
    const ownDown = myGroup ? objects.filter((id) => inGroup(id, myGroup)).length : objects.length;
    again = !foul && ownDown > 0;
  }

  players = credit(players, me, objects, players[me].group, foul);
  if (cueDown) balls = balls.map((b) => (b.id === 0 ? { ...b, down: false, ...freeSpot(balls, HEAD_SPOT.x, HEAD_SPOT.y) } : b));
  return {
    ...s,
    balls,
    players,
    phase,
    turn: again ? me : other,
    ballInHand: !!foul,
    shots: s.shots + 1,
    last: { no: s.shots + 1, by: me, before, input, potted: ids, foul, again, assigned },
  };
}

function credit(players: [BilliardsPlayer, BilliardsPlayer], me: 0 | 1, objects: number[], group: Group | null, foul: Foul | null): [BilliardsPlayer, BilliardsPlayer] {
  const own = group ? objects.filter((id) => inGroup(id, group)).length : objects.length;
  const next: [BilliardsPlayer, BilliardsPlayer] = [{ ...players[0] }, { ...players[1] }];
  next[me] = { ...next[me], potted: next[me].potted + own, fouls: next[me].fouls + (foul ? 1 : 0) };
  return next;
}

/** The 8 back on the foot spot (or the nearest free place behind it along the long axis). */
function spotEight(balls: BallState[]): BallState[] {
  const others = balls.filter((b) => b.id !== 8);
  return balls.map((b) => (b.id === 8 ? { id: 8, down: false, ...freeSpot(others, FOOT_SPOT.x, FOOT_SPOT.y) } : b));
}

/** The first free spot at (x, y) or moving towards the foot rail, then towards the head. */
function freeSpot(balls: BallState[], x: number, y: number): { x: number; y: number } {
  const free = (px: number) => balls.every((b) => b.down || b.id === 0 || (b.x - px) * (b.x - px) + (b.y - y) * (b.y - y) >= BALL_D * BALL_D);
  for (let px = x; px <= TABLE_W - BALL_R; px += 0.5) if (free(px)) return { x: px, y };
  for (let px = x; px >= BALL_R; px -= 0.5) if (free(px)) return { x: px, y };
  return { x, y };
}

/** A player let their shot clock run out: a foul, the opponent shoots with ball in hand. */
export function timeoutFoul(s: BilliardsState): BilliardsState {
  if (s.phase === 'over') return s;
  const me = s.turn;
  const players: [BilliardsPlayer, BilliardsPlayer] = [{ ...s.players[0] }, { ...s.players[1] }];
  players[me] = { ...players[me], fouls: players[me].fouls + 1 };
  return {
    ...s,
    players,
    phase: s.phase === 'break' ? 'open' : s.phase,
    turn: me === 0 ? 1 : 0,
    ballInHand: true,
    last: s.last ? { ...s.last, foul: 'timeout', again: false } : null,
  };
}

/** A player left: the other one wins. */
export function forfeit(s: BilliardsState, seat: 0 | 1): BilliardsState {
  if (s.phase === 'over') return s;
  return { ...s, phase: 'over', ballInHand: false, winner: seat === 0 ? 1 : 0, reason: 'forfeit' };
}
