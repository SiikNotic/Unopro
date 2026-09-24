import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { REEL, REELS } from '@/casino/slots';
import { ReelMotion } from '@/casino/premium/reelMotion';
import { SymbolArt } from './SymbolArt';
import { SYMBOL_ORDER } from './themes';
import type { MachineTheme } from './themes';
const KEY_OF_STOP = REEL.map((s) => SYMBOL_ORDER.indexOf(s));
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
  theme: MachineTheme;
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
export const ReelSet = forwardRef<ReelSetHandle, ReelSetProps>(function ReelSet({ theme, initialStops, cellHeight, reduced, highlight, onReelLand }, ref) {
  const motions = useRef<ReelMotion[]>(initialStops.map((s) => new ReelMotion(s)));
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
    const m = motions.current[r];
    const strip = strips.current[r];
    if (!strip) return;
    const base = Math.floor(m.pos);
    const frac = m.pos - base;
    strip.style.transform = `translate3d(0, ${(-(1 + frac) * heightRef.current).toFixed(2)}px, 0)`;
    for (let j = 0; j < CELLS; j++) {
      const el = cells.current[r][j];
      if (!el) continue;
      const k = String(KEY_OF_STOP[m.stopAtCell(base - 2 + j)]);
      if (el.dataset.k !== k) el.dataset.k = k;
    }
    const fast = m.phase === 'cruise' || m.phase === 'accel';
    reels.current[r]?.classList.toggle('is-fast', fast);
  }, []);

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
        motions.current.forEach((m, r) => m.start(t + r * 0.055));
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
          // Reels stop left to right; with a tease the last two hold back and brake slowly.
          const base = Math.max(now(), spinStart.current + 0.6);
          const extra = [0, 0, 0, tease ? 0.55 : 0, tease ? 1.35 : 0];
          motions.current.forEach((m, r) => m.requestStop(stops[r], base + r * 0.21 + extra[r], tease && r >= 3 ? 10 : undefined));
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
    [draw, loop]
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
                {SYMBOL_ORDER.map((sym) => (
                  <SymbolArt key={sym} skin={theme.symbols[sym]} wild={sym === 'star'} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});
