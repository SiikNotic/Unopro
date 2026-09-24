import { memo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { MachineId } from '@/casino/premium/engine';
import { PRESENTATION } from './presentation';

const Bulbs = ({ where, n }: { where: 'top' | 'bottom'; n: number }) => (
  <span className={`lk-bulbs ${where}`} aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <i key={i} style={{ '--i': i } as React.CSSProperties} />
    ))}
  </span>
);

/** Cosmic Spins' starfield: warps while the reels spin. Runs only while visible; capped star count. */
export const Starfield = memo(function Starfield({ warp, paused }: { warp: boolean; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const warpRef = useRef(warp);
  warpRef.current = warp;
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || paused) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() }));
    let frame = 0;
    let speed = 0.02;
    let last = performance.now();
    let tick = 0;
    const step = (t: number) => {
      // At rest the drift is slow: half the frame rate is plenty and saves battery.
      if (!warpRef.current && tick++ % 2) {
        frame = requestAnimationFrame(step);
        return;
      }
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      speed += ((warpRef.current ? 1.1 : 0.03) - speed) * Math.min(1, dt * 3);
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const pz = s.z;
        s.z -= speed * dt;
        if (s.z <= 0.02) {
          s.x = Math.random() - 0.5;
          s.y = Math.random() - 0.5;
          s.z = 1;
          continue;
        }
        const sx = w / 2 + (s.x / s.z) * w;
        const sy = h / 2 + (s.y / s.z) * h;
        const px = w / 2 + (s.x / pz) * w;
        const py = h / 2 + (s.y / pz) * h;
        const a = Math.min(1, (1 - s.z) * 1.4);
        ctx.strokeStyle = `rgba(${s.z < 0.4 ? '244,242,255' : '53,224,255'},${a})`;
        ctx.lineWidth = Math.max(0.6, (1 - s.z) * 2);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx + 0.5, sy + 0.5);
        ctx.stroke();
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const onVis = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [paused]);
  return <canvas ref={canvas} className="cs-stars" aria-hidden />;
});

interface CabinetProps {
  id: MachineId;
  /** Extra classes on the root (state: is-spinning, is-lit, is-idle…). */
  className?: string;
  spinning?: boolean;
  lite?: boolean;
  /** Tiles in the lobby get a lighter set of decorations. */
  compact?: boolean;
  children: ReactNode;
}

/**
 * The machine's body: every machine has its own construction (chrome and bulbs, glass vitrine, temple
 * lintel, volcanic rock, bamboo and sunset, ship planks, HUD, art deco). Children go inside the cabinet.
 */
export function Cabinet({ id, className = '', spinning = false, lite = false, compact = false, children }: CabinetProps) {
  const p = PRESENTATION[id];
  return (
    <div className={`mc mc-${id} ${lite ? 'is-lite' : ''} ${className}`} style={p.palette as React.CSSProperties}>
      <div className="mc-shell">
        <div className="mc-cab">
          {id === 'lucky7s' && (
            <>
              <Bulbs where="top" n={compact ? 10 : 18} />
              <Bulbs where="bottom" n={compact ? 10 : 18} />
            </>
          )}
          {id === 'diamondRoyale' && (
            <>
              <span className="dr-spot" aria-hidden />
              <span className="dr-sweep" aria-hidden />
            </>
          )}
          {id === 'goldenFortune' && <span className="gf-sun mc-deco-hide" aria-hidden />}
          {id === 'inferno' && <span className="if-cracks" aria-hidden />}
          {id === 'tropical' && (
            <>
              <span className="tp-sun" aria-hidden />
              <span className="tp-waves" aria-hidden />
            </>
          )}
          {id === 'pirates' && <span className="pr-rivets" aria-hidden />}
          {id === 'cosmic' && (
            <>
              {!lite && <Starfield warp={spinning} paused={compact} />}
              {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                <span key={c} className={`cs-bracket ${c}`} aria-hidden />
              ))}
            </>
          )}
          {id === 'royal' && <span className="ry-burst" aria-hidden />}
          {children}
        </div>
      </div>
    </div>
  );
}
