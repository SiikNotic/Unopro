import { memo } from 'react';
import { GameCard } from '@/components/table/GameCard';
import { chipColor } from '@/casino/chipValues';

const GOLD = 'rgba(233, 196, 106, 0.55)';

/** A western revolver outline, pointing right, on a 120×40 grid. */
function RevolverOutline({ transform }: { transform: string }) {
  return (
    <g transform={transform} fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 12h66v9H4z" />
      <path d="M66 8h22l6 7v14H70l-4-8z" />
      <rect x="70" y="13" width="16" height="11" rx="3" />
      <path d="M72 29c0 6 3 9 8 9M94 29c3 8 5 14 6 20l-11 4c-2-8-3-16-2-24" />
    </g>
  );
}

function CactusOutline({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round">
      <path d="M14 60V8c0-4 6-4 6 0v52M14 36H8c-3 0-4-2-4-5V20c0-3 4-3 4 0v10h6M20 28h5V16c0-3 4-3 4 0v10c0 4-2 6-6 6h-3" />
    </g>
  );
}

/** Gold filigree printed on the felt: curved rules, crossed revolvers and cacti. Decorative. */
export const FeltArt = memo(function FeltArt({ topText, bottomText }: { topText: string; bottomText: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden>
      <defs>
        <path id="bj-arc-top" d="M150 170 Q500 420 850 170" />
        <path id="bj-arc-bottom" d="M200 250 Q500 520 800 250" />
      </defs>
      {/* double gold border following the table edge */}
      <path d="M30 20 H970 V60 Q970 540 500 540 Q30 540 30 60 Z" fill="none" stroke={GOLD} strokeWidth="3" />
      <path d="M52 34 H948 V64 Q948 516 500 516 Q52 516 52 64 Z" fill="none" stroke={GOLD} strokeWidth="1.4" strokeDasharray="2 6" />
      {/* printed arcs */}
      <path d="M150 170 Q500 420 850 170" fill="none" stroke={GOLD} strokeWidth="2" />
      <text fontSize="30" fontWeight="800" letterSpacing="6" fill="rgba(233,196,106,0.7)" style={{ fontFamily: 'Georgia, serif' }}>
        <textPath href="#bj-arc-top" startOffset="50%" textAnchor="middle" dy="-10">
          {topText}
        </textPath>
      </text>
      <text fontSize="22" fontWeight="700" letterSpacing="4" fill="rgba(233,196,106,0.55)" style={{ fontFamily: 'Georgia, serif' }}>
        <textPath href="#bj-arc-bottom" startOffset="50%" textAnchor="middle">
          {bottomText}
        </textPath>
      </text>
      {/* filigree scrolls */}
      {[
        'M90 110c40-30 80 10 50 30s-40-30 0-40',
        'M910 110c-40-30-80 10-50 30s40-30 0-40',
        'M170 400c30 20 70 0 60-25s-45 5-20 25',
        'M830 400c-30 20-70 0-60-25s45 5 20 25',
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      ))}
      <RevolverOutline transform="translate(250 420) rotate(-12)" />
      <RevolverOutline transform="translate(750 420) scale(-1 1) rotate(-12)" />
      <CactusOutline x={455} y={440} s={0.9} />
      <CactusOutline x={520} y={440} s={0.9} />
    </svg>
  );
});

/** Brass card shoe (top right of the table). */
export const CardShoe = memo(function CardShoe({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 56" className={className} aria-hidden>
      <defs>
        <linearGradient id="bj-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.45" stopColor="#d9aa4a" />
          <stop offset="1" stopColor="#7a4e0a" />
        </linearGradient>
      </defs>
      <path d="M8 18 L60 6 L74 14 L74 46 L20 52 L8 44 Z" fill="url(#bj-brass)" stroke="#5a3a06" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 18 L20 26 L74 14" fill="none" stroke="#5a3a06" strokeWidth="1.2" />
      <path d="M20 26 V52" stroke="#5a3a06" strokeWidth="1.2" />
      {/* card peeking out of the mouth */}
      <path d="M10 20 L32 14 L40 30 L18 36 Z" fill="#fbf6e8" stroke="#b9ad90" strokeWidth="1" />
      <path d="M26 38c6-2 10-2 14 2" stroke="#fff6c7" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
});

/** Discard tray with a few spent cards (top left of the table). */
export const DiscardTray = memo(function DiscardTray({ width }: { width: number }) {
  return (
    <div className="relative" style={{ width: width * 1.25, height: width * 1.05 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <GameCard
          key={i}
          faceDown
          className="absolute"
          style={{ '--cw': `${width}px`, left: i * 3, top: 0, transform: `rotate(${90 + i * 4}deg) translate(${-width * 0.2}px, ${-width * 0.15}px)` } as React.CSSProperties}
        />
      ))}
    </div>
  );
});

/** The player's bank shown as clay chip stacks next to the betting spot. */
export const ChipStacks = memo(function ChipStacks({ balance, size }: { balance: number; size: number }) {
  const stacks: { value: number; count: number }[] = [];
  let rest = balance;
  for (const value of [500, 100, 25, 10]) {
    const count = Math.min(7, Math.floor(rest / value));
    if (count > 0) stacks.push({ value, count });
    rest -= count * value;
  }
  return (
    <div className="flex items-end gap-1" aria-hidden>
      {stacks.map((s) => (
        <div key={s.value} className="relative" style={{ width: size, height: size * 0.62 + s.count * size * 0.16 }}>
          {Array.from({ length: s.count }, (_, i) => (
            <span
              key={i}
              className="absolute left-0 rounded-full bj-stack-chip"
              style={{ width: size, height: size * 0.62, bottom: i * size * 0.16, '--chip': chipColor(s.value) } as React.CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  );
});
