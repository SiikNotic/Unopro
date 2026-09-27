// AIR HOCKEY: the table on screen. Fits the space it's given (portrait, table proportions), follows the player's
// finger or mouse (the red mallet goes where it points, within its half) and draws every frame. The match itself is
// advanced by the controller; this component only turns real time into controller.advance() and draws the result.
import { useEffect, useRef } from 'react';
import { AI_HOME, H, PLAYER_HOME, W } from '../table';
import type { HockeyController } from '../controller';
import { drawFrame, drawStatic, FULL_H, FULL_W, RIM, stepParticles } from './draw';
import type { Particle } from './draw';

export interface TableFx {
  particles: Particle[];
  flash: { side: 'player' | 'ai'; amount: number } | null;
}

const IDLE = {
  puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
  player: { ...PLAYER_HOME, vx: 0, vy: 0 },
  ai: { ...AI_HOME, vx: 0, vy: 0 },
};

export function HockeyTable({ controller, fx, label }: { controller: HockeyController | null; fx: TableFx; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef(controller);
  ctrl.current = controller;

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let layer: HTMLCanvasElement | null = null;
    let scale = 1;
    let dpr = 1;

    const resize = () => {
      const box = el.getBoundingClientRect();
      scale = Math.max(0.05, Math.min(box.width / FULL_W, box.height / FULL_H));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = Math.floor(FULL_W * scale);
      const cssH = Math.floor(FULL_H * scale);
      cv.style.width = `${cssW}px`;
      cv.style.height = `${cssH}px`;
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
      layer = document.createElement('canvas');
      layer.width = cv.width;
      layer.height = cv.height;
      const lc = layer.getContext('2d');
      if (lc) {
        lc.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        drawStatic(lc);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    const start = last;
    const frame = (now: number) => {
      const ms = Math.min(250, now - last);
      last = now;
      const c = ctrl.current;
      c?.advance(ms);
      stepParticles(fx.particles, ms / 1000);
      if (fx.flash) {
        fx.flash.amount -= ms / 900;
        if (fx.flash.amount <= 0) fx.flash = null;
      }
      const s = c?.state;
      const puckShown = !s || s.phase !== 'goal';
      if (layer)
        drawFrame(ctx, layer, scale, dpr, {
          puck: puckShown ? (s?.puck ?? IDLE.puck) : null,
          player: s?.player ?? IDLE.player,
          ai: s?.ai ?? IDLE.ai,
          trail: c?.trail ?? [],
          particles: fx.particles,
          flash: fx.flash,
          time: (now - start) / 1000,
        });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Pause while the tab is hidden (the match waits; it never runs on unseen).
    const onVis = () => {
      if (ctrl.current) ctrl.current.paused = document.hidden;
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);

    const toTable = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) / scale - RIM;
      // On touch screens the mallet sits a little above the fingertip, so the finger doesn't hide it.
      const y = (e.clientY - r.top) / scale - RIM - (e.pointerType === 'touch' ? 40 : 0);
      ctrl.current?.setTarget(x, y);
    };
    const down = (e: PointerEvent) => {
      cv.setPointerCapture?.(e.pointerId);
      toTable(e);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) toTable(e);
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
    };
  }, [fx]);

  return (
    <div ref={wrap} className="ah-table-wrap">
      <canvas ref={canvas} className="ah-table" role="img" aria-label={label} />
    </div>
  );
}
