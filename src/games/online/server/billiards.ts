// 8-Ball in online rooms (1 vs 1). The server is the only authority: a player sends only aim, power, spin
// and (with ball in hand) where to put the cue ball; the server checks it's their turn, that the balls have
// stopped and that the shot number matches (no double shots), runs the physics and the rules itself and
// stores the result. Both players receive the same view, including the last shot's exact input and starting
// position, so each screen replays the same deterministic simulation and then settles on the server's
// final positions.
import { applyShot, createBilliards, forfeit, rematchBilliards, timeoutFoul } from '@/games/billiards/rules';
import type { BilliardsState, Shot } from '@/games/billiards/rules';
import { DT } from '@/games/billiards/physics';

/** A player has this long for each shot (after the balls stop); then it's a foul and the opponent has ball in hand. */
export const SHOT_LIMIT = 60_000;
/** A player who hasn't been heard from for this long is shown as disconnected (they can come back). */
export const AWAY_AFTER = 45_000;

export type BilliardsAction = { type: 'SHOOT'; no: number; shot: Shot };

/** What both players see. Nothing in 8-Ball is hidden, but the rack seed stays on the server. */
export interface BilliardsView {
  state: Omit<BilliardsState, 'seed'>;
  /** Seats not heard from recently. */
  away: string[];
  /** When the balls of the last shot stop (server clock, ms): no shot is accepted before. */
  restAt: number;
}

export const seatIndex = (seat: string): 0 | 1 | null => (seat === 's0' ? 0 : seat === 's1' ? 1 : null);

export function createRoomBilliards(names: [string, string], seed: number): BilliardsState {
  return createBilliards(
    [
      { id: 's0', name: names[0], kind: 'human' },
      { id: 's1', name: names[1], kind: 'human' },
    ],
    seed,
  );
}

export function billiardsView(s: BilliardsState, restAt: number, away: string[]): BilliardsView {
  const { seed: _seed, ...state } = s;
  void _seed;
  return { state, away, restAt };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Untrusted input → a shot, or null. Only the known fields, only numbers. */
export function parseBilliardsAction(raw: unknown): BilliardsAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'SHOOT' || !Number.isInteger(r.no)) return null;
  const s = (r.shot && typeof r.shot === 'object' && !Array.isArray(r.shot) ? r.shot : null) as Record<string, unknown> | null;
  if (!s) return null;
  const dx = num(s.dx);
  const dy = num(s.dy);
  const power = num(s.power);
  if (dx === undefined || dy === undefined || power === undefined) return null;
  const shot: Shot = { dx, dy, power, spinX: num(s.spinX) ?? 0, spinY: num(s.spinY) ?? 0 };
  if (s.cueX !== undefined || s.cueY !== undefined) {
    const cx = num(s.cueX);
    const cy = num(s.cueY);
    if (cx === undefined || cy === undefined) return null;
    shot.cueX = cx;
    shot.cueY = cy;
  }
  if (s.pocket !== undefined) {
    if (!Number.isInteger(s.pocket)) return null;
    shot.pocket = s.pocket as number;
  }
  return { type: 'SHOOT', no: r.no as number, shot };
}

export type ShootOutcome = { ok: true; state: BilliardsState; restAt: number } | { ok: false; error: string };

/**
 * One shot from `seat` at server time `now`. `restAt` is when the previous shot's balls stop; the new
 * `restAt` is now plus how long this shot's balls roll (from the simulation's own step count).
 */
export function shootBilliards(s: BilliardsState, seat: string, a: BilliardsAction, now: number, restAt: number): ShootOutcome {
  const me = seatIndex(seat);
  if (me === null) return { ok: false, error: 'not_a_player' };
  if (s.phase === 'over') return { ok: false, error: 'game_over' };
  if (s.turn !== me) return { ok: false, error: 'not_your_turn' };
  if (a.no !== s.shots + 1) return { ok: false, error: 'stale_shot' };
  if (now < restAt - 250) return { ok: false, error: 'balls_moving' };
  const res = applyShot(s, a.shot);
  if (!res.ok) return res;
  const rolling = Math.ceil((res.result?.steps ?? 0) * DT * 1000);
  return { ok: true, state: res.state, restAt: now + rolling };
}

/** The shot clock: an idle player's turn becomes a foul (ball in hand for the opponent). */
export function advanceBilliards(s: BilliardsState, restAt: number, now: number): { state: BilliardsState; restAt: number } {
  let state = s;
  let at = restAt;
  // At most a couple of timeouts per catch-up (each one hands the table over).
  for (let i = 0; i < 2 && state.phase !== 'over' && now >= at + SHOT_LIMIT; i++) {
    state = timeoutFoul(state);
    at += SHOT_LIMIT;
  }
  return { state, restAt: at };
}

export function billiardsWinner(s: BilliardsState): string[] | null {
  if (s.phase !== 'over' || s.winner === null) return null;
  return [s.winner === 0 ? 's0' : 's1'];
}

export const forfeitSeat = (s: BilliardsState, seat: string): BilliardsState => {
  const i = seatIndex(seat);
  return i === null ? s : forfeit(s, i);
};

export const rematchRoomBilliards = rematchBilliards;
