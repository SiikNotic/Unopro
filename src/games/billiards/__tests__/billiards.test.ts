import { describe, expect, it } from 'vitest';
import { BALL_D, BALL_R, FOOT_SPOT, HEAD_X, POCKETS, TABLE_H, TABLE_W, rackPositions } from '../table';
import { Simulation, simulate, rollDistance, speedToRoll } from '../physics';
import type { BallState } from '../physics';
import { applyShot, canPlaceCue, createBilliards, forfeit, judge, legalTargets, normalizeShot, onEight, rematchBilliards, stageOf, timeoutFoul } from '../rules';
import type { BilliardsState } from '../rules';
import { planShot } from '../ai';
import type { BotLevel } from '../ai';

const players = [
  { id: 'a', name: 'Ana', kind: 'human' as const },
  { id: 'b', name: 'Bot', kind: 'bot' as const },
];
const fresh = (seed = 7) => createBilliards(players, seed);
/** A table with only these balls up (the rest pocketed), cue ball where given. */
function setup(s: BilliardsState, up: Record<number, [number, number]>, patch: Partial<BilliardsState> = {}): BilliardsState {
  return { ...s, ...patch, balls: s.balls.map((b) => (up[b.id] ? { id: b.id, x: up[b.id][0], y: up[b.id][1], down: false } : { ...b, down: true })) };
}
const shot = (dx: number, dy: number, power: number, extra = {}) => normalizeShot({ dx, dy, power, ...extra })!;

describe('rack', () => {
  it('puts 15 balls in a triangle with the 8 in the centre and one of each group in the back corners', () => {
    for (const seed of [1, 2, 3, 99]) {
      const s = fresh(seed);
      expect(s.balls).toHaveLength(16);
      const spots = rackPositions();
      const at = (i: number) => s.balls.find((b) => b.x === spots[i].x && b.y === spots[i].y)!.id;
      expect(at(4)).toBe(8);
      const corners = [at(10), at(14)].sort((a, b) => a - b);
      expect(corners[0]).toBeLessThan(8);
      expect(corners[1]).toBeGreaterThan(8);
      // No two balls overlap, all on the cloth.
      for (const a of s.balls) {
        expect(a.x).toBeGreaterThan(BALL_R);
        expect(a.y).toBeLessThan(TABLE_H - BALL_R);
        for (const b of s.balls) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(BALL_D);
      }
    }
    expect(fresh(1).balls.map((b) => b.x)).toEqual(fresh(1).balls.map((b) => b.x));
    expect(fresh(2).phase).toBe('break');
    expect(stageOf(fresh(2))).toBe('BREAK');
  });
});

describe('physics', () => {
  const two: BallState[] = [
    { id: 0, x: 60, y: 63.5, down: false },
    { id: 3, x: 120, y: 63.5, down: false },
  ];
  it('a straight full hit stops the cue ball and sends the object ball on', () => {
    const r = simulate(two, shot(1, 0, 0.1));
    expect(r.firstContact).toBe(3);
    const cue = r.balls.find((b) => b.id === 0)!;
    const ob = r.balls.find((b) => b.id === 3)!;
    expect(cue.x).toBeLessThan(125);
    expect(ob.x).toBeGreaterThan(150);
    expect(Math.abs(ob.y - 63.5)).toBeLessThan(0.5);
  });
  it('follow makes the cue ball run on, draw brings it back', () => {
    const stun = simulate(two, shot(1, 0, 0.12)).balls.find((b) => b.id === 0)!.x;
    const fol = simulate(two, shot(1, 0, 0.12, { spinY: 1 })).balls.find((b) => b.id === 0)!.x;
    const drw = simulate(two, shot(1, 0, 0.12, { spinY: -1 })).balls.find((b) => b.id === 0)!.x;
    expect(fol).toBeGreaterThan(stun + 15);
    expect(drw).toBeLessThan(stun - 15);
  });
  it('balls bounce off the cushions and lose speed', () => {
    const cushions: number[] = [];
    const r = simulate([{ id: 0, x: 80, y: 63.5, down: false }], shot(0, -1, 0.4), (e) => e.type === 'cushion' && cushions.push(e.speed));
    const cue = r.balls[0];
    expect(cue.down).toBe(false);
    expect(cue.y).toBeGreaterThan(BALL_R - 0.01);
    expect(cue.y).toBeLessThan(TABLE_H - BALL_R + 0.01);
    expect(cushions.length).toBeGreaterThan(1);
    expect(cushions[1]).toBeLessThan(cushions[0]);
  });
  it('a ball rolled into a corner pocket drops', () => {
    const r = simulate([{ id: 0, x: 40, y: 40, down: false }], shot(-1, -1, 0.3));
    expect(r.potted).toEqual([{ ball: 0, pocket: 0 }]);
    expect(r.balls[0].down).toBe(true);
  });
  it('a ball rolled straight into a side pocket drops, one rolling along the rail past it does not', () => {
    expect(simulate([{ id: 0, x: TABLE_W / 2, y: 60, down: false }], shot(0, -1, 0.3)).potted[0]?.pocket).toBe(1);
    const along = simulate([{ id: 0, x: 40, y: BALL_R + 0.05, down: false }], shot(1, 0, 0.25));
    expect(along.potted.find((p) => p.pocket === 1)).toBeUndefined();
  });
  it('is deterministic: same start and shot, same result, and stepping equals finishing', () => {
    const s = fresh(5);
    const a = simulate(s.balls, shot(1, 0.01, 1));
    const b = simulate(s.balls, shot(1, 0.01, 1));
    expect(a).toEqual(b);
    const sim = new Simulation(s.balls, shot(1, 0.01, 1));
    while (!sim.done) sim.step();
    expect(sim.result()).toEqual(a);
  });
  it('friction helpers agree with each other', () => {
    expect(rollDistance(speedToRoll(150))).toBeCloseTo(150, 0);
  });
});

describe('rules', () => {
  it('break: legal break keeps the table open; the shooter continues only if a ball dropped', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const r = applyShot(fresh(seed), { dx: 1, dy: 0, power: 1, cueX: HEAD_X - 1, cueY: 63.5 + seed * 0.2 });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.state.phase === 'open' || r.state.phase === 'over').toBe(true);
      const dropped = r.state.last!.potted.some((id) => id !== 0);
      if (!r.state.last!.foul) expect(r.state.turn).toBe(dropped ? 0 : 1);
      expect(r.state.players[0].group).toBeNull();
    }
  });
  it('break: the cue ball must be placed behind the head string', () => {
    expect(applyShot(fresh(), { dx: 1, dy: 0, power: 1, cueX: HEAD_X + 10, cueY: 60 }).ok).toBe(false);
    expect(canPlaceCue(fresh(), HEAD_X - 5, 60)).toBe(true);
  });
  it('a weak break that drops nothing and reaches few cushions is a foul: ball in hand for the opponent', () => {
    const r = applyShot(fresh(), { dx: 1, dy: 0, power: 0.12 });
    expect(r.ok && r.state.last!.foul).toBe('bad_break');
    expect(r.ok && r.state.turn).toBe(1);
    expect(r.ok && r.state.ballInHand).toBe(true);
  });
  it('open table: first legally pocketed ball assigns the groups and the shooter continues', () => {
    const s = setup(fresh(), { 0: [100, 63.5], 3: [160, 63.5], 5: [30, 110], 11: [60, 30], 8: [60, 100] }, { phase: 'open', ballInHand: false });
    const r = applyShot(s, aimAt(s, 3, 5));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.last!.potted).toContain(3);
    expect(r.state.players[0].group).toBe('solids');
    expect(r.state.players[1].group).toBe('stripes');
    expect(r.state.turn).toBe(0);
    expect(stageOf(r.state)).toBe('PLAYER_GROUP_ASSIGNED');
  });
  it('hitting the wrong group first is a foul; pocketing only the opponent ball passes the turn', () => {
    const base = setup(fresh(), { 0: [60, 63.5], 3: [200, 100], 11: [120, 63.5], 8: [60, 110] }, { phase: 'assigned', ballInHand: false });
    const s: BilliardsState = { ...base, players: [{ ...base.players[0], group: 'solids' }, { ...base.players[1], group: 'stripes' }] };
    const r = applyShot(s, { dx: 1, dy: 0, power: 0.3 });
    expect(r.ok && r.state.last!.foul).toBe('wrong_ball');
    expect(r.ok && r.state.turn).toBe(1);
    expect(r.ok && r.state.ballInHand).toBe(true);
  });
  it('no contact and scratches are fouls; a scratched cue ball comes back for the opponent', () => {
    const s = setup(fresh(), { 0: [40, 40], 3: [200, 100], 8: [60, 110] }, { phase: 'open', ballInHand: false });
    const r = applyShot(s, { dx: -1, dy: -1, power: 0.3 });
    // Nothing was touched and the cue ball dropped: a foul either way.
    expect(r.ok && r.state.last!.foul).toBe('no_contact');
    expect(r.ok && r.state.last!.potted).toContain(0);
    if (r.ok) expect(r.state.balls.find((b) => b.id === 0)!.down).toBe(false);
    const miss = applyShot(s, { dx: 0, dy: 1, power: 0.2 });
    expect(miss.ok && miss.state.last!.foul).toBe('no_contact');
  });
  it('no cushion after contact and nothing pocketed is a foul', () => {
    const s = setup(fresh(), { 0: [100, 63.5], 3: [110, 63.5], 8: [60, 110] }, { phase: 'open', ballInHand: false });
    const r = applyShot(s, { dx: 1, dy: 0, power: 0.01 });
    expect(r.ok && r.state.last!.foul).toBe('no_rail');
  });
  it('ball in hand: the cue ball may go anywhere free, not on another ball', () => {
    const s = setup(fresh(), { 0: [100, 63.5], 3: [160, 63.5], 8: [60, 110] }, { phase: 'open', ballInHand: true });
    expect(canPlaceCue(s, 160, 63.5)).toBe(false);
    expect(canPlaceCue(s, 200, 30)).toBe(true);
    expect(applyShot({ ...s, ballInHand: false }, { dx: 1, dy: 0, power: 0.3, cueX: 200, cueY: 30 }).ok).toBe(false);
  });
  it('the 8: pocketing it after clearing the group, in the called pocket, wins', () => {
    const base = setup(fresh(), { 0: [100, 63.5], 8: [160, 63.5] }, { phase: 'assigned', ballInHand: false });
    const s: BilliardsState = { ...base, players: [{ ...base.players[0], group: 'solids' }, { ...base.players[1], group: 'stripes' }] };
    expect(onEight(s, 0)).toBe(true);
    expect(legalTargets(s)).toEqual([8]);
    expect(stageOf(s)).toBe('EIGHT_BALL');
    expect(applyShot(s, { dx: 1, dy: 0, power: 0.3 }).ok).toBe(false); // must call a pocket
    const a = aimAt(s, 8, 5);
    const win = applyShot(s, a);
    expect(win.ok && win.state.phase).toBe('over');
    expect(win.ok && win.state.winner).toBe(0);
    expect(win.ok && win.state.reason).toBe('eight');
    const wrong = applyShot(s, { ...a, pocket: 0 });
    expect(wrong.ok && wrong.state.winner).toBe(1);
    expect(wrong.ok && wrong.state.reason).toBe('eight_wrong_pocket');
  });
  it('the 8 before your group is cleared loses', () => {
    const base = setup(fresh(), { 0: [100, 63.5], 8: [160, 63.5], 3: [60, 110] }, { phase: 'assigned', ballInHand: false });
    const s: BilliardsState = { ...base, players: [{ ...base.players[0], group: 'stripes' }, { ...base.players[1], group: 'solids' }] };
    // Stripes are all down: on the 8. Put a stripe back up to make it early.
    const early: BilliardsState = { ...s, balls: s.balls.map((b) => (b.id === 12 ? { id: 12, x: 30, y: 20, down: false } : b)) };
    const r = applyShot(early, aimAt(early, 8, 5, true));
    expect(r.ok && r.state.reason).toBe('eight_early');
    expect(r.ok && r.state.winner).toBe(1);
  });
  it('the 8 on the break is spotted again', () => {
    const s = fresh();
    const res = simulate(s.balls, shot(1, 0, 1));
    const fake = { ...res, potted: [{ ball: 8, pocket: 5 }], balls: res.balls.map((b) => (b.id === 8 ? { ...b, down: true } : b)) };
    const after = judge(s, s.balls, shot(1, 0, 1), fake);
    const eight = after.balls.find((b) => b.id === 8)!;
    expect(eight.down).toBe(false);
    expect(eight.y).toBeCloseTo(FOOT_SPOT.y, 5);
    expect(after.phase).toBe('open');
  });
  it('turn timeouts, forfeits and rematches', () => {
    const s = { ...fresh(), phase: 'open' as const, ballInHand: false };
    const t = timeoutFoul(s);
    expect(t.turn).toBe(1);
    expect(t.ballInHand).toBe(true);
    expect(t.players[0].fouls).toBe(1);
    const f = forfeit(s, 0);
    expect(f.phase).toBe('over');
    expect(f.winner).toBe(1);
    const r = rematchBilliards(f, 11);
    expect(r.breaker).toBe(1);
    expect(r.match).toBe(2);
    expect(r.phase).toBe('break');
  });
  it('rejects nonsense input', () => {
    expect(normalizeShot({ dx: 0, dy: 0, power: 0.5 })).toBeNull();
    expect(normalizeShot({ dx: NaN, dy: 1, power: 0.5 })).toBeNull();
    expect(normalizeShot({ dx: 1, dy: 0, power: 9, spinX: 7 })).toMatchObject({ power: 1, spinX: 1 });
  });
});

describe('AI', () => {
  it('pockets an easy straight shot at every level (before its own aim error)', () => {
    const s = setup(fresh(), { 0: [100, 63.5], 3: [160, 63.5], 11: [60, 20], 8: [60, 110] }, { phase: 'open', ballInHand: false });
    for (const lv of ['easy', 'normal', 'hard', 'expert'] as BotLevel[]) {
      const p = planShot(s, lv, 1);
      expect(p.target).not.toBeNull();
      expect(p.thinkMs).toBeGreaterThan(500);
      expect(p.thinkMs).toBeLessThan(1600);
    }
  });
  it('always makes legal requests, and stronger bots play cleaner games', () => {
    const games = (lv: BotLevel) => {
      let fouls = 0;
      let shots = 0;
      for (let g = 1; g <= 3; g++) {
        let s = createBilliards([players[1], { ...players[1], id: 'c' }], g * 31);
        for (let n = 0; n < 150 && s.phase !== 'over'; n++) {
          const r = applyShot(s, planShot(s, lv, g * 100 + n).shot);
          expect(r.ok).toBe(true);
          if (!r.ok) break;
          if (r.state.last?.foul) fouls++;
          shots++;
          s = r.state;
        }
        expect(s.phase).toBe('over');
      }
      return fouls / shots;
    };
    expect(games('expert')).toBeLessThan(games('easy'));
  }, 120000);
  it('with ball in hand it places the cue ball legally', () => {
    const s = setup(fresh(), { 0: [100, 63.5], 3: [160, 63.5], 8: [60, 110] }, { phase: 'open', ballInHand: true });
    const p = planShot(s, 'expert', 3);
    expect(p.shot.cueX).toBeDefined();
    expect(canPlaceCue(s, p.shot.cueX!, p.shot.cueY!)).toBe(true);
  });
});

/** A clean shot sending `ball` into `pocket` (ghost-ball aim), from the current cue position. */
function aimAt(s: BilliardsState, ball: number, pocket: number, call = true) {
  const cue = s.balls.find((b) => b.id === 0)!;
  const ob = s.balls.find((b) => b.id === ball)!;
  const pk = POCKETS[pocket];
  const L = Math.hypot(pk.aimX - ob.x, pk.aimY - ob.y);
  const gx = ob.x - ((pk.aimX - ob.x) / L) * BALL_D;
  const gy = ob.y - ((pk.aimY - ob.y) / L) * BALL_D;
  return { dx: gx - cue.x, dy: gy - cue.y, power: 0.45, ...(call ? { pocket } : {}) };
}

describe('aiming guide', () => {
  it('finds the first ball on the line, the object direction and the pocket it is heading for', async () => {
    const { aimGuide } = await import('../aim');
    const balls: BallState[] = [
      { id: 0, x: 60, y: 63.5, down: false },
      { id: 3, x: 160, y: 63.5, down: false },
      { id: 5, x: 200, y: 63.5, down: false },
    ];
    const g = aimGuide(balls, balls[0], 1, 0);
    expect(g.hit).toBe(3);
    expect(g.end.x).toBeCloseTo(160 - BALL_D, 5);
    expect(g.object!.dx).toBeCloseTo(1, 5);
    expect(g.object!.fullness).toBeCloseTo(1, 5);
    // Straight at the corner pocket: the guide says which one.
    const corner: BallState[] = [
      { id: 0, x: 40, y: 40, down: false },
      { id: 3, x: 20, y: 20, down: false },
    ];
    expect(aimGuide(corner, corner[0], -1, -1).pocket).toBe(0);
    // Nothing on the line: it stops at the cushion and mirrors.
    const free = aimGuide([{ id: 0, x: 60, y: 63.5, down: false }], { x: 60, y: 63.5 }, 0, -1);
    expect(free.hit).toBeNull();
    expect(free.end.y).toBeCloseTo(BALL_R, 5);
    expect(free.after).toEqual({ dx: 0, dy: 1 });
  });
});
