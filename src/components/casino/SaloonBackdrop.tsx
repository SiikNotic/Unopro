import { memo } from 'react';

const BOTTLES = [
  { x: 8, h: 30, w: 9, c: '#7a3b12' },
  { x: 22, h: 36, w: 8, c: '#2f5d2a' },
  { x: 34, h: 26, w: 10, c: '#a0561b' },
  { x: 49, h: 34, w: 8, c: '#3b2a55' },
  { x: 62, h: 28, w: 9, c: '#8a2a1a' },
  { x: 76, h: 38, w: 8, c: '#6b4a12' },
  { x: 89, h: 24, w: 11, c: '#2a4a5a' },
];

/** Warm saloon interior behind the Gold Rush machine. Pure decoration, drawn in SVG. */
export const SaloonBackdrop = memo(function SaloonBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="sal-planks" width="64" height="900" patternUnits="userSpaceOnUse">
            <rect width="64" height="900" fill="#5a331c" />
            <rect x="0" width="62" height="900" fill="url(#sal-plank)" />
            <path d="M20 0v900M44 0v900" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
          </pattern>
          <linearGradient id="sal-plank" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#6b3e22" />
            <stop offset="0.5" stopColor="#7a4a29" />
            <stop offset="1" stopColor="#5e351d" />
          </linearGradient>
          <pattern id="sal-shelf" width="100" height="60" patternUnits="userSpaceOnUse">
            {BOTTLES.map((b) => (
              <g key={b.x}>
                <rect x={b.x} y={60 - b.h} width={b.w} height={b.h} rx="2" fill={b.c} />
                <rect x={b.x + b.w / 2 - 1.5} y={60 - b.h - 8} width="3" height="9" fill={b.c} />
                <rect x={b.x + 1.5} y={60 - b.h * 0.6} width={b.w - 3} height={b.h * 0.25} fill="#e9dcc0" opacity="0.55" />
                <rect x={b.x + 1} y={60 - b.h + 2} width="1.6" height={b.h - 6} fill="#fff" opacity="0.18" />
              </g>
            ))}
          </pattern>
          <radialGradient id="sal-glow">
            <stop offset="0" stopColor="rgba(255,190,90,0.55)" />
            <stop offset="1" stopColor="rgba(255,190,90,0)" />
          </radialGradient>
          <linearGradient id="sal-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(0,0,0,0.55)" />
            <stop offset="0.35" stopColor="rgba(0,0,0,0.1)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.65)" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#sal-planks)" />
        {/* back bar: shelves with bottles */}
        {[190, 300].map((y) => (
          <g key={y}>
            <rect x="0" y={y - 60} width="1440" height="60" fill="url(#sal-shelf)" />
            <rect x="0" y={y} width="1440" height="12" fill="#3a1f0f" />
            <rect x="0" y={y} width="1440" height="3" fill="#8a5a33" />
          </g>
        ))}
        {/* windows with evening light */}
        {[70, 1230].map((x) => (
          <g key={x}>
            <rect x={x} y="380" width="140" height="190" rx="6" fill="#f2a24a" opacity="0.55" />
            <path d={`M${x + 70} 380v190M${x} 475h140`} stroke="#3a1f0f" strokeWidth="8" />
            <rect x={x - 8} y="372" width="156" height="206" rx="8" fill="none" stroke="#3a1f0f" strokeWidth="12" />
          </g>
        ))}
        {/* wainscot + bar counter */}
        <rect x="0" y="640" width="1440" height="260" fill="#3b2012" />
        <rect x="0" y="630" width="1440" height="18" fill="#8a5a33" />
        {Array.from({ length: 16 }, (_, i) => (
          <rect key={i} x={i * 92 + 16} y="680" width="68" height="170" rx="4" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="3" />
        ))}
        {/* wanted poster and saloon sign */}
        <g transform="translate(300 360) rotate(-4)">
          <rect width="110" height="140" fill="#e8d7ae" stroke="#7a5a33" strokeWidth="3" />
          <text x="55" y="30" textAnchor="middle" fontSize="20" fontWeight="900" fill="#4a2a12" fontFamily="serif">WANTED</text>
          <circle cx="55" cy="75" r="26" fill="#b89a6a" />
          <text x="55" y="126" textAnchor="middle" fontSize="16" fontWeight="900" fill="#4a2a12" fontFamily="serif">$500</text>
        </g>
        <g transform="translate(1030 380) rotate(3)">
          <rect width="150" height="56" rx="6" fill="#4a2412" stroke="#c9a24a" strokeWidth="3" />
          <text x="75" y="37" textAnchor="middle" fontSize="26" fontWeight="900" fill="#f5c451" fontFamily="serif" letterSpacing="3">SALOON</text>
        </g>
        <rect width="1440" height="900" fill="url(#sal-shade)" />
      </svg>
      {/* hanging lanterns */}
      {['12%', '50%', '88%'].map((left, i) => (
        <div key={left} className="sal-lantern" style={{ left, animationDelay: `${i * -1.3}s` }}>
          <span className="sal-lantern-cord" />
          <span className="sal-lantern-body" />
          <span className="sal-lantern-glow" />
        </div>
      ))}
    </div>
  );
});
