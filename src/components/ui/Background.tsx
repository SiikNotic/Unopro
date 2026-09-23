import { useMemo } from 'react';

export function Background() {
  const orbs = useMemo(
    () => [
      { className: 'top-[-10%] left-[-5%] w-[55vw] h-[55vw] bg-brand-500/12', delay: '0s' },
      { className: 'bottom-[-15%] right-[-10%] w-[60vw] h-[60vw] bg-brand-700/10', delay: '2s' },
      { className: 'top-[30%] right-[10%] w-[35vw] h-[35vw] bg-gold-500/6', delay: '4s' },
    ],
    []
  );

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-ink-950">
      <div className="absolute inset-0 bg-gradient-to-b from-ink-900 via-ink-950 to-ink-950" />
      {orbs.map((orb, i) => (
        <div
          key={i}
          className={`absolute rounded-full blur-[80px] sm:blur-[120px] animate-pulse-soft ${orb.className}`}
          style={{ animationDelay: orb.delay }}
        />
      ))}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />
    </div>
  );
}
