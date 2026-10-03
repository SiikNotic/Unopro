// The table on screen: draws the balls, the aiming guide and the cue, takes the player's aim (drag anywhere on
// the cloth to point the cue), lets them place the cue ball when they have it in hand, and plays a shot back by
// stepping the very same simulation the rules used (deterministic), in real time, with sounds.
import { useEffect, useRef } from 'react';
import { DT, Simulation } from '../physics';
import type { BallState, PhysicsEvent, ShotInput } from '../physics';
import { aimGuide } from '../aim';
import { BALL_R, POCKETS, TABLE_H, TABLE_W } from '../table';
import { drawFrame, makeView, paintTable, toWorld } from './draw';
import type { Frame, View } from './draw';

export interface Replay {
  key: string;
  before: BallState[];
  input: ShotInput;
}

export interface PoolTableProps {
  balls: BallState[];
  /** The player may aim / place now. */
  interactive: boolean;
  aim: { dx: number; dy: number };
  onAim: (dx: number, dy: number) => void;
  /** 0–1, pulls the cue back. */
  power: number;
  /** Ball in hand: where the cue ball is being put, and the check for a spot. */
  inHand: boolean;
  kitchen: boolean;
  canPlace: (x: number, y: number) => boolean;
  onPlace: (x: number, y: number) => void;
  /** Pocket call for the 8. */
  calling: boolean;
  called: number | null;
  onCall: (p: number) => void;
  targets: number[];
  /** A shot to play back; `onReplayDone` when its balls stop. */
  replay: Replay | null;
  onReplayEvent?: (e: PhysicsEvent) => void;
  onReplayDone?: (key: string) => void;
  /** Accessible description of the table. */
  label: string;
}

export function PoolTable(p: PoolTableProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef(p);
  props.current = p;
  const view = useRef<View | null>(null);
  const table = useRef<HTMLCanvasElement | null>(null);
  const dpr = useRef(1);
  const sim = useRef<{ key: string; sim: Simulation; acc: number; last: number } | null>(null);
  const falling = useRef<{ id: number; x: number; y: number; t: number }[]>([]);
  const drag = useRef<null | { kind: 'aim' } | { kind: 'place'; x: number; y: number; ok: boolean }>(null);
  const finished = useRef<string | null>(null);

  // Size: fit the box, upright on portrait screens.
  useEffect(() => {
    const el = wrap.current!;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const v = makeView(r.width, r.height);
      view.current = v;
      dpr.current = Math.min(2.5, window.devicePixelRatio || 1);
      const c = canvas.current!;
      c.width = Math.round(v.w * dpr.current);
      c.height = Math.round(v.h * dpr.current);
      c.style.width = `${v.w}px`;
      c.style.height = `${v.h}px`;
      table.current = paintTable(v, dpr.current);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start a replay when a new one arrives.
  useEffect(() => {
    const r = p.replay;
    if (!r || sim.current?.key === r.key || finished.current === r.key) return;
    const onEvent = (e: PhysicsEvent) => {
      if (e.type === 'pocket') {
        const b = sim.current?.sim.bodies.find((x) => x.id === e.ball);
        const pk = POCKETS[e.pocket];
        falling.current.push({ id: e.ball, x: b ? (b.x + pk.x) / 2 : pk.x, y: b ? (b.y + pk.y) / 2 : pk.y, t: 0 });
      }
      props.current.onReplayEvent?.(e);
    };
    sim.current = { key: r.key, sim: new Simulation(r.before, r.input, onEvent), acc: 0, last: performance.now() };
  }, [p.replay]);

  // The drawing loop.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const c = canvas.current;
      const v = view.current;
      const tbl = table.current;
      if (!c || !v || !tbl || document.hidden) return;
      const cur = props.current;
      // Advance a running shot in real time (a long pause, e.g. a background tab, doesn't fast-forward).
      let balls = cur.balls;
      const run = sim.current;
      if (run) {
        const dt = Math.min(0.1, (now - run.last) / 1000);
        run.last = now;
        run.acc += dt;
        while (run.acc >= DT && !run.sim.done) {
          run.sim.step();
          run.acc -= DT;
        }
        balls = run.sim.snapshot();
        if (run.sim.done) {
          finished.current = run.key;
          sim.current = null;
          props.current.onReplayDone?.(run.key);
        }
      }
      falling.current = falling.current.map((f) => ({ ...f, t: f.t + 1 / 14 })).filter((f) => f.t < 1);

      const d = drag.current;
      const placing = d && d.kind === 'place' ? d : null;
      const shown = placing ? balls.map((b) => (b.id === 0 ? { ...b, x: placing.x, y: placing.y, down: false } : b)) : balls;
      const cueBall = shown.find((b) => b.id === 0 && !b.down);
      const aiming = cur.interactive && !run && !!cueBall;
      const guide = aiming && cueBall ? aimGuide(shown, cueBall, cur.aim.dx, cur.aim.dy) : null;
      const frame: Frame = {
        balls: shown,
        falling: falling.current,
        guide,
        cue: aiming ? { dx: cur.aim.dx, dy: cur.aim.dy, pull: 1 + cur.power * 22 } : null,
        targets: aiming ? cur.targets : [],
        wrongTarget: !!guide && guide.hit !== null && !cur.targets.includes(guide.hit),
        called: cur.called,
        calling: aiming && cur.calling,
        inHand: aiming && cur.inHand,
        placeOk: placing ? placing.ok : true,
        kitchen: aiming && cur.inHand && cur.kitchen,
        time: (now - start) / 1000,
      };
      const ctx = c.getContext('2d');
      if (ctx) drawFrame(ctx, v, dpr.current, tbl, frame);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const world = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return toWorld(view.current!, e.clientX - r.left, e.clientY - r.top);
  };
  const aimAt = (x: number, y: number) => {
    const cue = props.current.balls.find((b) => b.id === 0 && !b.down);
    if (!cue) return;
    const dx = x - cue.x;
    const dy = y - cue.y;
    if (dx * dx + dy * dy > 1) props.current.onAim(dx, dy);
  };

  const onDown = (e: React.PointerEvent) => {
    const cur = props.current;
    if (!cur.interactive || sim.current || !view.current) return;
    const [x, y] = world(e);
    const cue = cur.balls.find((b) => b.id === 0 && !b.down);
    if (cur.inHand && cue && Math.hypot(x - cue.x, y - cue.y) < BALL_R * 3.2) {
      drag.current = { kind: 'place', x: cue.x, y: cue.y, ok: true };
    } else if (cur.calling) {
      const pi = POCKETS.findIndex((pk) => Math.hypot(x - pk.x, y - pk.y) < 11);
      if (pi >= 0) {
        cur.onCall(pi);
        return;
      }
      drag.current = { kind: 'aim' };
      aimAt(x, y);
    } else {
      drag.current = { kind: 'aim' };
      aimAt(x, y);
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = world(e);
    if (d.kind === 'aim') aimAt(x, y);
    else {
      const cx = Math.max(BALL_R, Math.min(TABLE_W - BALL_R, x));
      const cy = Math.max(BALL_R, Math.min(TABLE_H - BALL_R, y));
      drag.current = { kind: 'place', x: cx, y: cy, ok: props.current.canPlace(cx, cy) };
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.kind === 'place' && d.ok) props.current.onPlace(d.x, d.y);
  };

  return (
    <div ref={wrap} className="bl-table-box">
      <canvas
        ref={canvas}
        className="bl-canvas"
        role="img"
        aria-label={p.label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}
