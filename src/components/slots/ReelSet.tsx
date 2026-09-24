import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { REELS, stripsOf } from '@/casino/premium/engine';
import type { MachineMath } from '@/casino/premium/engine';
import { ReelMotion } from '@/casino/premium/reelMotion';
import { SymbolArt } from './SymbolArt';
import { art3d } from './art3d';
import type { MachinePresentation } from './presentation';

const CELLS = 5;

export interface ReelSetHandle {
  /** Starts every reel (staggered). */
  start(): void;
  /** Lands the reels on `stops`; resolves once all of them rest. */
  land(stops: number[], opts: { tease: boolean }): Promise<void>;
  /** Slam stop: land as soon as possible (the result is already known). */
  hurry(): void;
  /** Shows `stops` at once, without motion. */
  place(stops: number[]): void;
  isMoving(): boolean;
}

interface ReelSetProps {
  math: MachineMath;
  look: MachinePresentation;
  initialStops: number[];
  cellHeight: number;
  reduced: boolean;
  /** "reel:row" of the winning cells to light up; the others dim. null = no highlight. */
  highlight: Set<string> | null;
  onReelLand?: (reel: number) => void;
}

const now = () => performance.now() / 1000;

/**
 * Five reels drawn imperatively from a requestAnimationFrame loop: React renders the cells once and the
 * loop only moves them and swaps which symbol each recycled cell shows. The loop runs only while a reel
 * moves and is cancelled on unmount.
 */
export const ReelSet = forwardRef<ReelSetHandle, ReelSetProps>(function ReelSet({ math, look, initialStops, cellHeight, reduced, highlight, onReelLand }, ref) {
  // Every symbol of the machine is rendered once per recycled cell; `data-k` picks the visible one.
  const order = useRef(Object.keys(math.symbols)).current;
  const keyOfStop = useRef(stripsOf(math).map((strip) => strip.map((sym) => order.indexOf(sym)))).current;
  const motions = useRef<ReelMotion[]>(initialStops.map((s, r) => new ReelMotion(s, keyOfStop[r].length, look.motion)));
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const reels = useRef<(HTMLDivElement | null)[]>([]);
  const cells = useRef<(HTMLDivElement | null)[][]>(Array.from({ length: REELS }, () => []));
  const frame = useRef(0);
  const spinStart = useRef(0);
  const pending = useRef<(() => void) | null>(null);
  const heightRef = useRef(cellHeight);
  heightRef.current = cellHeight;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const onLandRef = useRef(onReelLand);
  onLandRef.current = onReelLand;

  const draw = useCallback((r: number) => {
    // (keyOfStop is fixed for the machine; the screen remounts per machine)
    const m = motions.current[r];
    const strip = strips.current[r];
    if (!strip) return;
    const base = Math.floor(m.pos);
    const frac = m.pos - base;
    strip.style.transform = `translate3d(0, ${(-(1 + frac) * heightRef.current).toFixed(2)}px, 0)`;
    for (let j = 0; j < CELLS; j++) {
      const el = cells.current[r][j];
      if (!el) continue;
      const k = String(keyOfStop[r][m.stopAtCell(base - 2 + j)]);
      if (el.dataset.k !== k) el.dataset.k = k;
    }
    const fast = m.phase === 'cruise' || m.phase === 'accel';
    reels.current[r]?.classList.toggle('is-fast', fast);
  }, [keyOfStop]);

  const tick = useCallback(() => {
    const t = now();
    let moving = false;
    for (let r = 0; r < REELS; r++) {
      const m = motions.current[r];
      if (!m.moving) continue;
      const landed = m.step(t);
      draw(r);
      if (landed) {
        if (!reducedRef.current) reels.current[r]?.animate?.([{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'translateY(0)' }], { duration: 170, easing: 'ease-out' });
        onLandRef.current?.(r);
      }
      if (m.moving) moving = true;
    }
    if (moving) frame.current = requestAnimationFrame(tick);
    else {
      frame.current = 0;
      const done = pending.current;
      pending.current = null;
      done?.();
    }
  }, [draw]);

  const loop = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  }, [tick]);

  useLayoutEffect(() => {
    for (let r = 0; r < REELS; r++) draw(r);
  }, [draw, cellHeight]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      const done = pending.current;
      pending.current = null;
      done?.();
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      start() {
        if (reducedRef.current) return;
        const t = now();
        spinStart.current = t;
        motions.current.forEach((m, r) => m.start(t + r * 0.05));
        loop();
      },
      land(stops, { tease }) {
        return new Promise<void>((resolve) => {
          const prev = pending.current;
          pending.current = () => {
            prev?.();
            resolve();
          };
          if (reducedRef.current || !motions.current.some((m) => m.moving)) {
            motions.current.forEach((m, r) => m.place(stops[r]));
            for (let r = 0; r < REELS; r++) draw(r);
            cancelAnimationFrame(frame.current);
            frame.current = 0;
            const done = pending.current;
            pending.current = null;
            done?.();
            return;
          }
          // Reels stop left to right at the machine's pace; with a tease the last two hold back.
          const base = Math.max(now(), spinStart.current + 0.55);
          const extra = [0, 0, 0, tease ? look.tease[0] : 0, tease ? look.tease[1] : 0];
          motions.current.forEach((m, r) => m.requestStop(stops[r], base + r * look.stagger + extra[r], tease && r >= 3 ? look.motion.brakeCells + 4 : undefined));
          loop();
        });
      },
      hurry() {
        const t = now();
        motions.current.forEach((m, r) => m.hurry(t + r * 0.06));
      },
      place(stops) {
        motions.current.forEach((m, r) => m.place(stops[r]));
        for (let r = 0; r < REELS; r++) draw(r);
      },
      isMoving: () => motions.current.some((m) => m.moving),
    }),
    [draw, loop, look]
  );

  // Winning cells light up, the rest dim. Visible rows are cells 1–3 once the reels rest.
  useEffect(() => {
    for (let r = 0; r < REELS; r++) {
      for (let j = 0; j < CELLS; j++) {
        const el = cells.current[r][j];
        if (!el) continue;
        const row = j - 1;
        const win = !!highlight && highlight.has(`${r}:${row}`);
        el.classList.toggle('is-win', win);
        el.classList.toggle('is-dim', !!highlight && !win);
      }
    }
  }, [highlight]);

  return (
    <div className="ps-reels" style={{ height: cellHeight * 3 }}>
      {Array.from({ length: REELS }, (_, r) => (
        <div key={r} ref={(el) => (reels.current[r] = el)} className="ps-reel">
          <div ref={(el) => (strips.current[r] = el)} className="ps-strip">
            {Array.from({ length: CELLS }, (_, j) => (
              <div key={j} ref={(el) => (cells.current[r][j] = el)} className="ps-cell" style={{ height: cellHeight }}>
                {order.map((sym) => (
                  <SymbolArt key={sym} def={look.symbols[sym]} style={look.style} kind={math.symbols[sym].kind} src={art3d(math.id, sym)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});
