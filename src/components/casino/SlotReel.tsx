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
  /** The payline symbol is part of the win. */
  highlight?: boolean;
  /** Keep-them-waiting glow while this reel is still turning. */
  anticipate?: boolean;
}

type Motion = 'rest' | 'fast' | 'settling' | 'landed';

/**
 * One reel. The strip is the real reel order from `from` to `to` (plus extra turns), so what scrolls past
 * is what is printed on the reel. Remount it (new key) for each spin.
 */
export function SlotReel({ from, to, loops, durationMs, cellHeight, highlight = false, anticipate = false }: SlotReelProps) {
  const distance = ((((to - from) % REEL.length) + REEL.length) % REEL.length) + loops * REEL.length;
  const [motion, setMotion] = useState<Motion>('rest');
  const moving = motion === 'fast' || motion === 'settling';

  useEffect(() => {
    if (distance === 0) return;
    let inner = 0;
    let sharp = 0;
    let land = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        if (durationMs <= 0) {
          setMotion('landed');
          return;
        }
        setMotion('fast');
        // Motion blur while the reel is fast; sharp again for the last stretch; a thump when it lands.
        // Started only after 'fast' so they can never be overtaken by it.
        sharp = window.setTimeout(() => setMotion('settling'), durationMs * 0.72);
        land = window.setTimeout(() => setMotion('landed'), durationMs);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.clearTimeout(sharp);
      window.clearTimeout(land);
    };
  }, [distance, durationMs]);

  const started = motion !== 'rest';
  const cells = Array.from({ length: distance + 3 }, (_, k) => symbolAt(from - 1 + k));
  const payIndex = distance + 1;
  return (
    <div
      className={`slot-reel flex-1 ${motion === 'landed' ? 'slot-reel-landed' : ''} ${anticipate && moving ? 'slot-reel-anticipate' : ''}`}
      style={{ height: cellHeight * 3 }}
    >
      <div
        className={`slot-strip ${motion === 'fast' ? 'slot-strip-blur' : ''}`}
        style={{
          transform: `translateY(${started ? -distance * cellHeight : 0}px)`,
          transition: started && distance > 0 ? `transform ${durationMs}ms cubic-bezier(0.32, 0.9, 0.35, 1.06), filter 0.2s` : 'none',
        }}
      >
        {cells.map((symbol, k) => (
          <div key={k} className={`slot-cell ${highlight && k === payIndex ? 'slot-cell-win' : ''}`} style={{ height: cellHeight }}>
            <SlotSymbolIcon symbol={symbol} />
          </div>
        ))}
      </div>
    </div>
  );
}
