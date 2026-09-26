// The flight: one canvas draws the climbing curve and the exhaust sparks; the rocket, its flame and the
// explosion are images moved with CSS transforms; the multiplier text is written straight to the DOM each
// frame (no React render per frame). The animation loop runs only while the rocket flies and stops with the
// tab hidden. Reduced motion (system or Settings) keeps the curve and the numbers, without sparks or shake.
import { memo, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { isLiteDevice } from '@/components/scene/particles';
import type { CrashState } from '../api';
import { multiplierAt, secondsTo } from '../fair';
import { COUNTDOWN_MS } from '../useCrash';
import type { CrashPhase } from '../useCrash';
import { crashSounds, startEngine } from '../sounds';
import rocketImg from '../assets/rocket.webp';
import flameImg from '../assets/flame.webp';
import explosionImg from '../assets/explosion.webp';

const MILESTONES = [2, 3, 5, 10, 20, 50, 100, 250, 500];
const ROCKET_RATIO = 824 / 1485;

interface Props {
  round: CrashState['round'];
  phase: CrashPhase;
  serverNow: () => number;
  /** The player's own cash-out in this round, if any (shown as a marker on the curve). */
  cashedAt: number | null;
  reduced: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const fmt = (m: number) => `${m.toFixed(2)}×`;

export const CrashStage = memo(function CrashStage({ round, phase, serverNow, cashedAt, reduced }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rocket = useRef<HTMLDivElement>(null);
  const flame = useRef<HTMLImageElement>(null);
  const mult = useRef<HTMLSpanElement>(null);
  const boom = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [count, setCount] = useState<number | null>(null);
  const lite = useRef(isLiteDevice());
  const sparks = useRef<Spark[]>([]);
  const sawFlight = useRef(false);
  const cashedRef = useRef(cashedAt);
  cashedRef.current = cashedAt;

  // Size of the stage (the canvas follows it at up to 2× device pixels).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Geometry of the plot for a flight time `ft` (seconds) and multiplier `m`.
  const geometry = (ft: number, m: number) => {
    const { w, h } = size;
    const x0 = w * 0.1;
    const y0 = h * 0.84;
    const x1 = w * 0.84;
    const y1 = h * 0.3;
    const tMax = Math.max(8, ft * 1.12);
    const mMax = Math.max(1.8, m * 1.18);
    const px = (s: number) => x0 + (s / tMax) * (x1 - x0);
    const py = (x: number) => y0 - ((x - 1) / (mMax - 1)) * (y0 - y1);
    return { x0, y0, px, py };
  };

  // Draws the curve up to flight time `ft`; returns where the rocket is and where it points.
  const draw = (ft: number, m: number, crashed: boolean) => {
    const c = canvas.current;
    const { w, h } = size;
    if (!c || !w || !h) return { x: 0, y: 0, angle: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d');
    if (!g) return { x: 0, y: 0, angle: 0 };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const { x0, y0, px, py } = geometry(ft, m);
    // faint guide lines
    g.strokeStyle = 'rgba(216,178,106,0.10)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i <= 4; i++) {
      const y = y0 - ((y0 - h * 0.3) * i) / 4;
      g.moveTo(x0, y);
      g.lineTo(w * 0.96, y);
    }
    g.stroke();
    if (ft <= 0) return { x: x0, y: y0, angle: 0 };
    const steps = 48;
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const s = (ft * i) / steps;
      pts.push([px(s), py(Math.exp(0.06 * s))]);
    }
    const [ex, ey] = pts[pts.length - 1];
    // glow fill under the curve
    const fill = g.createLinearGradient(0, ey, 0, y0);
    fill.addColorStop(0, crashed ? 'rgba(200,40,50,0.35)' : 'rgba(232,184,90,0.32)');
    fill.addColorStop(1, 'rgba(232,184,90,0)');
    g.beginPath();
    g.moveTo(x0, y0);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(ex, y0);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    // the trail: a wide soft stroke and a bright core
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [width, color] of [
      [10, crashed ? 'rgba(220,50,60,0.25)' : 'rgba(255,190,80,0.22)'],
      [3.5, crashed ? '#e0525f' : '#f6d27a'],
    ] as const) {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.strokeStyle = color;
      g.lineWidth = width;
      g.stroke();
    }
    // the player's cash-out, marked on the curve
    const mine = cashedRef.current;
    if (mine && mine <= m) {
      const cx = px(secondsTo(mine));
      const cy = py(mine);
      g.fillStyle = '#3fd688';
      g.beginPath();
      g.arc(cx, cy, 5, 0, Math.PI * 2);
      g.fill();
    }
    const [bx, by] = pts[pts.length - 4];
    const angle = Math.min(1.35, Math.max(0.35, Math.atan2(ex - bx, by - ey)));
    return { x: ex, y: ey, angle };
  };

  // Rocket, flame and sparks at the head of the curve.
  const place = (x: number, y: number, angle: number, power: number, crashed: boolean) => {
    const el = rocket.current;
    if (!el) return;
    const rh = Math.max(64, Math.min(150, size.h * 0.26));
    el.style.height = `${rh}px`;
    el.style.width = `${rh * ROCKET_RATIO}px`;
    el.style.transform = `translate(${x - (rh * ROCKET_RATIO) / 2}px, ${y - rh}px) rotate(${angle}rad)`;
    el.style.opacity = crashed ? '0' : '1';
    if (flame.current) flame.current.style.transform = `translateX(-50%) scaleY(${power})`;
  };

  const spark = (x: number, y: number, angle: number, dt: number) => {
    const g = canvas.current?.getContext('2d');
    if (!g || reduced || lite.current) return;
    const list = sparks.current;
    // back of the rocket: opposite its heading
    const bx = -Math.sin(angle);
    const by = Math.cos(angle);
    for (let i = 0; i < 2 && list.length < 60; i++) {
      list.push({ x, y, vx: bx * (60 + Math.random() * 60) + (Math.random() - 0.5) * 40, vy: by * (60 + Math.random() * 60) + (Math.random() - 0.5) * 40, life: 1 });
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.6;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      g.fillStyle = `rgba(255,${Math.round(120 + 110 * p.life)},60,${p.life * 0.8})`;
      g.beginPath();
      g.arc(p.x, p.y, 1.2 + p.life * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  };

  // The frame loop while flying; a static frame otherwise.
  useEffect(() => {
    if (!size.w) return;
    const txt = mult.current;
    if (phase === 'betting' || phase === 'countdown') {
      sparks.current = [];
      draw(0, 1, false);
      const { x0, y0 } = geometry(0, 1);
      place(x0, y0, 0, phase === 'countdown' ? 0.45 : 0.18, false);
      if (txt) txt.textContent = fmt(1);
      return;
    }
    if (phase === 'crashed') {
      const x = round.crash ?? 1;
      const { x: rx, y: ry, angle } = draw(secondsTo(x), x, true);
      place(rx, ry, angle, 0, true);
      if (txt) txt.textContent = fmt(x);
      const b = boom.current;
      if (b) {
        b.style.left = `${rx}px`;
        b.style.top = `${ry}px`;
      }
      return;
    }
    // flying
    sawFlight.current = true;
    if (serverNow() - round.startsAt < 1500) crashSounds.launch();
    const engine = startEngine();
    let raf = 0;
    let last = performance.now();
    let milestone = MILESTONES.findIndex((v) => v > multiplierAt((serverNow() - round.startsAt) / 1000));
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ft = Math.max(0, (serverNow() - round.startsAt) / 1000);
      const m = multiplierAt(ft);
      const { x, y, angle } = draw(ft, m, false);
      spark(x, y, angle, dt);
      place(x, y, angle, 0.55 + Math.min(0.45, Math.log(m) * 0.2) + (reduced ? 0 : Math.random() * 0.08), false);
      if (txt) txt.textContent = fmt(m);
      engine.set(m);
      if (milestone >= 0 && m >= MILESTONES[milestone]) {
        crashSounds.milestone(milestone);
        milestone = milestone + 1 < MILESTONES.length ? milestone + 1 : -1;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop reads the latest refs; it restarts per phase/round/size
  }, [phase, round.id, round.crash, size.w, size.h, reduced]);

  // The crash sound, only for a crash seen live (not when the screen opens on a finished round).
  useEffect(() => {
    if (phase === 'crashed' && sawFlight.current) {
      crashSounds.crash();
      sawFlight.current = false;
    }
  }, [phase, round.id]);

  // Countdown 3-2-1 (with beeps), then the rocket leaves.
  useEffect(() => {
    if (phase !== 'countdown') {
      setCount(null);
      return;
    }
    let shown = -1;
    const tick = () => {
      const left = Math.ceil((round.startsAt - serverNow()) / 1000);
      const n = Math.max(1, Math.min(3, left));
      if (n !== shown) {
        shown = n;
        setCount(n);
        crashSounds.tick(n === 1);
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [phase, round.startsAt, serverNow]);

  // Seconds left to bet (the gold bar under "Waiting for bets").
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (phase !== 'betting') return;
    const upd = () => setLeft(Math.max(0, round.startsAt - COUNTDOWN_MS - serverNow()));
    upd();
    const id = window.setInterval(upd, 200);
    return () => window.clearInterval(id);
  }, [phase, round.startsAt, serverNow]);

  const crashed = phase === 'crashed';
  return (
    <div ref={box} className={`cr-stage ${crashed ? 'is-crashed' : ''} ${phase === 'flying' ? 'is-flying' : ''} ${reduced ? 'is-reduced' : ''}`}>
      <canvas ref={canvas} className="cr-canvas" aria-hidden />
      <div ref={rocket} className="cr-rocket" aria-hidden>
        <img ref={flame} src={flameImg} alt="" className="cr-flame" draggable={false} />
        <img src={rocketImg} alt="" className="cr-rocket-img" draggable={false} />
      </div>
      {crashed && <img key={round.id} ref={boom} src={explosionImg} alt="" className="cr-boom" draggable={false} aria-hidden />}
      <div className="cr-readout" aria-live="polite">
        {phase === 'betting' && (
          <>
            <span className="cr-state">{t('crash.state.waiting')}</span>
            <span className="cr-bar" style={{ '--p': `${Math.min(100, (left / 5000) * 100)}%` } as React.CSSProperties} />
          </>
        )}
        {phase === 'countdown' && (
          <span key={count ?? 0} className="cr-count">
            {count}
          </span>
        )}
        <span ref={mult} className={`cr-mult ${phase === 'betting' || phase === 'countdown' ? 'is-idle' : ''}`} aria-hidden={phase === 'flying'}>
          1.00×
        </span>
        {phase === 'flying' && <span className="cr-state is-live">{t('crash.state.flying')}</span>}
        {crashed && <span className="cr-state is-crash">{t('crash.state.crashed', { x: fmt(round.crash ?? 1) })}</span>}
      </div>
    </div>
  );
});
