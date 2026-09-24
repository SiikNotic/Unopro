import { useEffect, useState } from 'react';

/**
 * Rolls a number from 0 up to `target` (ease-out) whenever `runKey` changes.
 * With `instant` it jumps straight to the target (reduced motion).
 */
export function useCountUp(target: number, durationMs: number, runKey: unknown, instant = false, onStep?: (value: number) => void): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (instant || target <= 0 || durationMs <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const next = Math.round(target * (1 - (1 - p) ** 3));
      setValue(next);
      onStep?.(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // onStep is a side channel (sounds); re-running on its identity would restart the roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, runKey, instant]);

  return value;
}
