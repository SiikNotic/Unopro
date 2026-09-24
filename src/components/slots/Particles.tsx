import { useEffect, useRef } from 'react';

interface ParticlesProps {
  /** A new value fires a new burst. */
  burstId: number;
  count: number;
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
  color: string;
  coin: boolean;
}

/**
 * Coins and sparks on one canvas over the screen. The animation loop runs only while particles are
 * alive; the canvas is sized to the viewport (device pixel ratio capped at 2) and everything is released
 * on unmount. Decorative: the parent skips it under reduced motion.
 */
export function Particles({ burstId, count, colors }: ParticlesProps) {
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

    const room = Math.max(0, MAX_PARTICLES - parts.current.length);
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
      const fromTop = i % 3 !== 0;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 380 + Math.random() * 520;
      parts.current.push({
        x: fromTop ? Math.random() * w : w / 2 + (Math.random() - 0.5) * 60,
        y: fromTop ? -20 - Math.random() * h * 0.4 : h * 0.42,
        vx: fromTop ? (Math.random() - 0.5) * 60 : Math.cos(angle) * speed,
        vy: fromTop ? 120 + Math.random() * 220 : Math.sin(angle) * speed,
        r: 5 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        life: 2.6 + Math.random() * 1.4,
        color: colors[i % colors.length],
        coin: Math.random() < 0.6,
      });
    }

    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      const alive: P[] = [];
      for (const p of parts.current) {
        p.life -= dt;
        p.vy += 900 * dt;
        p.vx *= 0.995;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.life <= 0 || p.y > h + 30) continue;
        alive.push(p);
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.fillStyle = p.color;
        if (p.coin) {
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r, p.r * Math.abs(Math.cos(p.rot)) + 1, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r * 0.5, -1.5, p.r, 3);
          ctx.fillRect(-1.5, -p.r * 0.5, 3, p.r);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      parts.current = alive;
      frame.current = alive.length ? requestAnimationFrame(step) : 0;
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
  }, [burstId, count, colors]);

  return <canvas ref={canvas} className="fixed inset-0 z-40 pointer-events-none w-full h-full" aria-hidden />;
}
