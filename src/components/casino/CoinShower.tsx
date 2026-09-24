import { memo, useMemo } from 'react';

interface CoinShowerProps {
  /** Changes for every new shower. */
  id: number;
  count: number;
}

/** Gold coins raining over the screen. Decorative; skipped entirely under reduced motion by the parent. */
export const CoinShower = memo(function CoinShower({ id, count }: CoinShowerProps) {
  const coins = useMemo(() => {
    // Deterministic per shower so re-renders don't reshuffle the coins.
    let seed = (id * 2654435761) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    return Array.from({ length: count }, (_, i) => ({
      key: `${id}-${i}`,
      left: rand() * 100,
      size: 16 + rand() * 18,
      delay: rand() * 0.9,
      duration: 1.4 + rand() * 1.2,
      drift: (rand() - 0.5) * 120,
      spin: 360 + rand() * 720,
    }));
  }, [id, count]);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden" aria-hidden>
      {coins.map((c) => (
        <span
          key={c.key}
          className="coin-fall"
          style={
            {
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              '--drift': `${c.drift}px`,
              '--spin': `${c.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});
