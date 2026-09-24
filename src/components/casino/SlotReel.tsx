import { useEffect, useState } from 'react';
import { REEL, symbolAt } from '@/casino/slots';
import { SlotSymbolIcon } from './slotSymbols';

interface SlotReelProps {
  /** Stop shown before the spin. */
  from: number;
  /** Stop the reel lands on (its payline symbol). */
  to: number;
  /** Extra full turns before landing. */
  loops: number;
  durationMs: number;
  cellHeight: number;
}

/**
 * One reel. The strip is the real reel order from `from` to `to` (plus extra turns), so what scrolls past
 * is what is printed on the reel. Remount it (new key) for each spin.
 */
export function SlotReel({ from, to, loops, durationMs, cellHeight }: SlotReelProps) {
  const distance = ((((to - from) % REEL.length) + REEL.length) % REEL.length) + loops * REEL.length;
  const [go, setGo] = useState(distance === 0);

  useEffect(() => {
    if (distance === 0) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGo(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [distance]);

  const cells = Array.from({ length: distance + 3 }, (_, k) => symbolAt(from - 1 + k));
  return (
    <div className="slot-reel flex-1" style={{ height: cellHeight * 3 }}>
      <div
        className="slot-strip"
        style={{
          transform: `translateY(${go ? -distance * cellHeight : 0}px)`,
          transition: go && distance > 0 ? `transform ${durationMs}ms cubic-bezier(0.3, 0.85, 0.35, 1.05)` : 'none',
        }}
      >
        {cells.map((symbol, k) => (
          <div key={k} className="slot-cell" style={{ height: cellHeight }}>
            <SlotSymbolIcon symbol={symbol} />
          </div>
        ))}
      </div>
    </div>
  );
}
