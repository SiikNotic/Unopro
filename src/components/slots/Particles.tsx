import { useEffect, useRef } from 'react';
import type { ParticleKind } from './presentation';

interface ParticlesProps {
  /** A new value fires a new burst. */
  burstId: number;
  count: number;
  kind: ParticleKind;
  colors: string[];
}

/** Hard cap on live particles, whatever bursts overlap. */
export const MAX_PARTICLES = 160;

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  color: string;
  phase: number;
}

/** Each machine's particles behave differently: what they are, where they come from, how they move. */
const SPAWN: Record<ParticleKind, (w: number, h: number, i: number) => Partial<P>> = {
  coins: (w, h) => ({ x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.9, vx: (Math.random() - 0.5) * 520, vy: -620 - Math.random() * 520, r: 7 + Math.random() * 5 }),
  sparkles: (w, h) => ({ x: w * (0.15 + Math.random() * 0.7), y: h * (0.2 + Math.random() * 0.45), vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, r: 5 + Math.random() * 9, max: 1.2 + Math.random() * 1.4 }),
  gold: (w, h) => ({ x: Math.random() * w, y: -30 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 160, r: 6 + Math.random() * 7 }),
  embers: (w, h) => ({ x: Math.random() * w, y: h + 10, vx: (Math.random() - 0.5) * 60, vy: -120 - Math.random() * 260, r: 2 + Math.random() * 4 }),
  petals: (w, h) => ({ x: Math.random() * w, y: -20 - Math.random() * h * 0.5, vx: 20 + Math.random() * 40, vy: 50 + Math.random() * 70, r: 6 + Math.random() * 6 }),
  doubloons: (w, h) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const s = 480 + Math.random() * 420;
    return { x: w / 2, y: h * 0.45, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 7 + Math.random() * 5 };
  },
  stars: (w, h) => {
    const a = Math.random() * Math.PI * 2;
    const s = 180 + Math.random() * 520;
    return { x: w / 2, y: h * 0.42, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 3 + Math.random() * 6, max: 1.4 + Math.random() };
  },
  confetti: (w, h) => ({ x: Math.random() * w, y: -20 - Math.random() * h * 0.4, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160, r: 5 + Math.random() * 5 }),
};
const GRAVITY: Record<ParticleKind, number> = { coins: 1100, sparkles: 0, gold: 380, embers: -60, petals: 20, doubloons: 1000, stars: 0, confetti: 90 };

function star(ctx: CanvasRenderingContext2D, r: number, points: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = (i * Math.PI) / points - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * One canvas over the screen for win celebrations. The loop runs only while particles are alive; the
 * canvas matches the viewport (device pixel ratio capped at 2). Decorative: skipped under reduced motion.
 */
export function Particles({ burstId, count, kind, colors }: ParticlesProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || burstId === 0 || count <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = Math.min(count, Math.max(0, MAX_PARTICLES - parts.current.length));
    for (let i = 0; i < n; i++) {
      const s = SPAWN[kind](w, h, i);
      const max = s.max ?? 2.6 + Math.random() * 1.4;
      parts.current.push({ x: 0, y: 0, vx: 0, vy: 0, r: 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10, color: colors[i % colors.length], phase: Math.random() * 6, ...s, life: max, max });
    }
    const g = GRAVITY[kind];
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      const alive: P[] = [];
      for (const p of parts.current) {
        p.life -= dt;
        p.vy += g * dt;
        if (kind === 'petals' || kind === 'embers') p.vx += Math.sin((p.life + p.phase) * 4) * 40 * dt;
        p.vx *= kind === 'stars' ? 0.97 : 0.995;
        p.vy *= kind === 'stars' ? 0.97 : 1;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.life <= 0 || p.y > h + 40 || p.y < -h) continue;
        alive.push(p);
        const fade = Math.min(1, p.life * 1.5, (p.max - p.life) * 6 + 0.2);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        switch (kind) {
          case 'coins':
          case 'gold':
          case 'doubloons':
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r, p.r * Math.abs(Math.cos(p.rot * 1.7)) + 1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = fade * 0.5;
            ctx.fillStyle = '#fff';
            ctx.fillRect(-p.r * 0.3, -1, p.r * 0.6, 2);
            break;
          case 'sparkles':
            ctx.scale(0.6 + 0.4 * Math.sin((p.life + p.phase) * 9), 0.6 + 0.4 * Math.sin((p.life + p.phase) * 9));
            star(ctx, p.r, 4, 0.22);
            break;
          case 'embers':
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(0, 0, p.r * (0.6 + 0.4 * Math.sin((p.life + p.phase) * 20)), 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'petals':
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'stars':
            star(ctx, p.r, 5, 0.45);
            break;
          case 'confetti':
            ctx.fillRect(-p.r / 2, -p.r / 4, p.r, (p.r / 2) * Math.abs(Math.cos(p.rot * 2)) + 1);
            break;
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      parts.current = alive;
      frame.current = alive.length ? requestAnimationFrame(step) : 0;
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
  }, [burstId, count, kind, colors]);

  return <canvas ref={canvas} className="fixed inset-0 z-40 pointer-events-none w-full h-full" aria-hidden />;
}
