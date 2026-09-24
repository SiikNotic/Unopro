import type { SlotSymbol } from '@/casino/slots';

// Original "Gold Rush" slot art, drawn on a 48×48 grid. Gradients are defined inline so every
// symbol renders on its own (duplicate ids hold identical definitions, which is harmless).

function Seven() {
  return (
    <>
      <defs>
        <linearGradient id="ss-seven" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7a6b" />
          <stop offset="0.55" stopColor="#d31f2e" />
          <stop offset="1" stopColor="#7d0a14" />
        </linearGradient>
        <linearGradient id="ss-seven-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset="1" stopColor="#c7860a" />
        </linearGradient>
      </defs>
      <path d="M8 5h32v8.5L25.5 44H13.5l13.8-29H8z" fill="url(#ss-seven)" stroke="url(#ss-seven-rim)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M11.5 8.5h24" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 16l-9.5 20" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function GoldBar() {
  return (
    <>
      <defs>
        <linearGradient id="ss-gold-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6c7" />
          <stop offset="1" stopColor="#f2c14e" />
        </linearGradient>
        <linearGradient id="ss-gold-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c445" />
          <stop offset="1" stopColor="#a86a05" />
        </linearGradient>
      </defs>
      {/* back bar */}
      <path d="M17 12h18l3.5 7h-25z" fill="url(#ss-gold-top)" stroke="#7a4e00" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.5 19h25l3 7.5h-31z" fill="url(#ss-gold-front)" stroke="#7a4e00" strokeWidth="1.6" strokeLinejoin="round" />
      {/* front bar */}
      <path d="M10 25h28l4 8H6z" fill="url(#ss-gold-top)" stroke="#7a4e00" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 33h36l3 9H3z" fill="url(#ss-gold-front)" stroke="#7a4e00" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 36.5h20" stroke="rgba(122,78,0,0.55)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 27.5h14" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" />
      {/* sparkle */}
      <path d="M40 4l1.4 3.6L45 9l-3.6 1.4L40 14l-1.4-3.6L35 9l3.6-1.4z" fill="#fffbe6" />
    </>
  );
}

function Eagle() {
  return (
    <>
      <defs>
        <linearGradient id="ss-eagle-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a4a22" />
          <stop offset="1" stopColor="#3a210d" />
        </linearGradient>
      </defs>
      {/* shoulders */}
      <path d="M9 46c1.5-11 7-18 16-20h15c3 6 3.5 13 2 20z" fill="url(#ss-eagle-body)" />
      <path d="M16 40c3-4 7-6 12-7M24 44c3-4 7-6 12-6" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* white head with ruffled neck */}
      <path
        d="M18 23c-2-8 2-16 11-17 8-1 13 5 13 12 0 5-1.5 9-3.5 12l-3.5-3-2.5 4-3-4-3 3.5-2.5-4-3.5 2z"
        fill="#fbf8f0"
        stroke="#c9c1ad"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* brow */}
      <path d="M20 13.5c3-1.8 6.5-2 10-1" stroke="#8d8570" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* hooked beak */}
      <path d="M21 13c-6 0-12 3-14 8.5 2-1.2 4.5-1.2 6 .8 1.5-2.6 4.4-4 8.5-4z" fill="#f5b400" stroke="#8a5a00" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 21.5c-.4 1.8 0 3.4 1.2 4.4" stroke="#8a5a00" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M13 22.3c2.5-.6 5.5-.4 8.5.2" stroke="#8a5a00" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* eye */}
      <circle cx="25" cy="15.2" r="2.4" fill="#f5b400" />
      <circle cx="25.3" cy="15.2" r="1.3" fill="#1b1206" />
      <circle cx="24.7" cy="14.6" r="0.5" fill="#fff" />
    </>
  );
}

function Bison() {
  return (
    <>
      <defs>
        <linearGradient id="ss-bison" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2e1a0b" />
          <stop offset="0.5" stopColor="#4d2f16" />
          <stop offset="1" stopColor="#7a5230" />
        </linearGradient>
      </defs>
      <ellipse cx="25" cy="43" rx="18" ry="2" fill="rgba(0,0,0,0.2)" />
      <path
        d="M5 29c-1-4 1-8 4-10 2-7 8-11 16-11 9 0 15 4 17.5 11 1.6 4 1.6 8 .3 12v11h-4.5v-7c-4 1.4-8.5 1.6-12.5.5l-.8 6.5h-4.5v-7.5c-3 .8-6 2.5-8.5 4.5-1.2-2.4-2.2-4.5-3.4-5.9C7.8 32.3 6 31 5 29z"
        fill="url(#ss-bison)"
        stroke="#1d1007"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* shaggy mane */}
      <path d="M12 17c3-5 8-8 14-8-2 3-2.5 7-1 11-2 4-5 7-9 9-2-3-4-6-4-12z" fill="#241307" opacity="0.75" />
      <path d="M14 14l-1.5-2M18 11l-1-2.4M22 9.5l-.4-2.4" stroke="#241307" strokeWidth="1.6" strokeLinecap="round" />
      {/* beard */}
      <path d="M9 30c1.5 3 2 6 1.6 9.4 1.8-1.4 3.4-3.4 4.4-6" fill="#1d1007" />
      {/* horn */}
      <path d="M11 19.5c-1.8-2-1.6-4.6.4-6 .2 1.6.9 2.8 2.4 3.6z" fill="#efe6d2" stroke="#6b5a3e" strokeWidth="0.9" strokeLinejoin="round" />
      {/* eye + nose */}
      <circle cx="10.3" cy="23.5" r="1.1" fill="#f3e2c0" />
      <circle cx="6.4" cy="28.2" r="0.9" fill="#0d0703" />
    </>
  );
}

function Wagon() {
  return (
    <>
      <defs>
        <linearGradient id="ss-canvas" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#d9ccb0" />
        </linearGradient>
      </defs>
      {/* tongue */}
      <path d="M40 30.5l6.5 4" stroke="#4a2c12" strokeWidth="2" strokeLinecap="round" />
      {/* canvas cover */}
      <path d="M8 26C6.5 16 12 9 24 9s17.5 7 16 17z" fill="url(#ss-canvas)" stroke="#8a7555" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15.5 26c-1-7 .5-12.5 3.5-16M24 26V9.2M32.5 26c1-7-.5-12.5-3.5-16" stroke="#b3a27f" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {/* wooden box */}
      <rect x="6.5" y="25" width="35" height="7.5" rx="1.2" fill="#8b5a2b" stroke="#4a2c12" strokeWidth="1.4" />
      <path d="M8 28.8h32" stroke="#5e3a19" strokeWidth="1" />
      {/* wheels */}
      {[
        [14, 36.5, 7.5],
        [34.5, 37.5, 6.5],
      ].map(([cx, cy, r]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3b220c" strokeWidth="2.4" />
          {[0, 30, 60, 90, 120, 150].map((a) => (
            <path key={a} d={`M${cx} ${cy - r + 1}V${cy + r - 1}`} transform={`rotate(${a} ${cx} ${cy})`} stroke="#6b4423" strokeWidth="1.2" />
          ))}
          <circle cx={cx} cy={cy} r="1.8" fill="#3b220c" />
        </g>
      ))}
    </>
  );
}

function SheriffStar() {
  const points = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    return [24 + Math.cos(a) * 20.5, 24 + Math.sin(a) * 20.5];
  });
  const d = points
    .map(([x, y], i) => {
      const a = (((i * 60 + 30) - 90) * Math.PI) / 180;
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}L${(24 + Math.cos(a) * 12).toFixed(1)} ${(24 + Math.sin(a) * 12).toFixed(1)}`;
    })
    .join('') + 'Z';
  return (
    <>
      <defs>
        <linearGradient id="ss-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3b8" />
          <stop offset="0.5" stopColor="#f0b72f" />
          <stop offset="1" stopColor="#9a6106" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#ss-badge)" stroke="#6b4300" strokeWidth="1.6" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.8" fill="url(#ss-badge)" stroke="#6b4300" strokeWidth="1.2" />
      ))}
      <circle cx="24" cy="24" r="11" fill="#f7cf5a" stroke="#6b4300" strokeWidth="1.3" />
      <text x="24" y="26.6" textAnchor="middle" fontSize="7.2" fontWeight="900" fill="#6b1a0a" style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>
        WILD
      </text>
    </>
  );
}

function Revolver() {
  return (
    <>
      <defs>
        <linearGradient id="ss-gun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9d3de" />
          <stop offset="1" stopColor="#4d5866" />
        </linearGradient>
        <linearGradient id="ss-grip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b5652a" />
          <stop offset="1" stopColor="#5a2a0c" />
        </linearGradient>
      </defs>
      {/* barrel */}
      <path d="M4 15.5h25v5.5H4z" fill="url(#ss-gun)" stroke="#27303a" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4 15.5h2.5v-2.5H4z" fill="#27303a" />
      <path d="M6 17.2h21" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      {/* frame + cylinder */}
      <path d="M26 13h11l3 4.5v8H27.5l-2.5-4z" fill="url(#ss-gun)" stroke="#27303a" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="27" y="17" width="9" height="7" rx="2.2" fill="#6b7785" stroke="#27303a" strokeWidth="1.1" />
      <path d="M30 17v7M33 17v7" stroke="#3b444f" strokeWidth="0.9" />
      {/* hammer */}
      <path d="M37 13l4.5-3.5 1.5 2-3 3.5z" fill="#4d5866" stroke="#27303a" strokeWidth="1" />
      {/* trigger guard */}
      <path d="M29 25.5c0 4 2 6 5 6" fill="none" stroke="#27303a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M32.5 25.5l-.6 3.5" stroke="#27303a" strokeWidth="1.3" strokeLinecap="round" />
      {/* wooden grip */}
      <path d="M36 25.5h4.5c1.5 5 3 10 3.5 15l-7 2.5c-1.2-5.5-2-11-1-17.5z" fill="url(#ss-grip)" stroke="#3a1a07" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="39.8" cy="33.5" r="1.1" fill="#e6c77a" />
    </>
  );
}

function MoneyBag() {
  return (
    <>
      <defs>
        <radialGradient id="ss-sack" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#f7df9a" />
          <stop offset="0.6" stopColor="#d9a441" />
          <stop offset="1" stopColor="#8a5a14" />
        </radialGradient>
      </defs>
      <path d="M18 13c-1.5-3-2.8-6-1.6-7.6 1.6-1.9 4 .2 7.6.2s6-2.1 7.6-.2c1.2 1.6-.1 4.6-1.6 7.6z" fill="url(#ss-sack)" stroke="#5e3a09" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M17 14.5c-8 5-12 12-11 19 1 7 8 10.5 18 10.5s17-3.5 18-10.5c1-7-3-14-11-19z" fill="url(#ss-sack)" stroke="#5e3a09" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 13.5h16" stroke="#7a2e10" strokeWidth="3" strokeLinecap="round" />
      <text x="24" y="36" textAnchor="middle" fontSize="16" fontWeight="900" fill="#5e3a09" style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>
        $
      </text>
      <path d="M11 26c-1 3-1 6 .5 8.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* spilled coins */}
      <ellipse cx="40" cy="42.5" rx="4.2" ry="2" fill="#f5c451" stroke="#7a4e00" strokeWidth="0.9" />
      <ellipse cx="8" cy="43" rx="3.6" ry="1.7" fill="#f5c451" stroke="#7a4e00" strokeWidth="0.9" />
    </>
  );
}

function CowboyHat() {
  return (
    <>
      <defs>
        <linearGradient id="ss-hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8703f" />
          <stop offset="1" stopColor="#4e2c12" />
        </linearGradient>
      </defs>
      {/* brim */}
      <path d="M3 29c3 5 10 8.5 21 8.5S42 34 45 29c-3 1.5-8 2.3-12 2.3H15c-4 0-9-.8-12-2.3z" fill="url(#ss-hat)" stroke="#2e1707" strokeWidth="1.4" strokeLinejoin="round" />
      {/* crown with pinch */}
      <path d="M13.5 31c-1-8 0-15 3.5-19 2-2.2 4.5-1 7.5.8 3-1.8 5.5-3 7.5-.8 3.5 4 4.5 11 3.5 19z" fill="url(#ss-hat)" stroke="#2e1707" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M24 13v8" stroke="#3a1d08" strokeWidth="1.3" strokeLinecap="round" />
      {/* band */}
      <path d="M13.6 26.5h20.8l-.2 4.5H13.8z" fill="#b51d22" stroke="#5e0b0e" strokeWidth="1" />
      <circle cx="30" cy="28.7" r="1.4" fill="#e6c77a" />
      <path d="M17 16c-1.2 3-1.6 6-1.3 9" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function Cactus() {
  return (
    <>
      <defs>
        <linearGradient id="ss-cactus" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2f8a3d" />
          <stop offset="0.5" stopColor="#56c25e" />
          <stop offset="1" stopColor="#1f6a2c" />
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="44" rx="13" ry="2.2" fill="rgba(0,0,0,0.2)" />
      <path d="M19 44V9c0-3 2.2-5 5-5s5 2 5 5v35z" fill="url(#ss-cactus)" stroke="#124a1d" strokeWidth="1.4" />
      <path d="M19 30h-5c-3.3 0-5-2-5-5V15c0-2 1.3-3.2 3-3.2s3 1.2 3 3.2v9h4z" fill="url(#ss-cactus)" stroke="#124a1d" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M29 25h4.5V12.5c0-2 1.3-3.2 3-3.2s3 1.2 3 3.2V22c0 4-2.5 7-6.5 7H29z" fill="url(#ss-cactus)" stroke="#124a1d" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M24 7v36" stroke="#1f6a2c" strokeWidth="1.1" />
      {[12, 18, 24, 30, 36].map((y) => (
        <path key={y} d={`M20.5 ${y}l-1.8-.8M27.5 ${y + 3}l1.8-.8`} stroke="#e8f5d0" strokeWidth="0.9" strokeLinecap="round" />
      ))}
      <circle cx="24" cy="4.6" r="2.2" fill="#ff5d8f" />
      <circle cx="24" cy="4.6" r="0.9" fill="#ffd166" />
    </>
  );
}

function Horseshoe() {
  return (
    <>
      <defs>
        <linearGradient id="ss-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2f5f8" />
          <stop offset="0.5" stopColor="#a9b4c0" />
          <stop offset="1" stopColor="#5d6875" />
        </linearGradient>
      </defs>
      <path
        d="M11 7C4 18 5.5 42 24 42S44 18 37 7l-7 2.2c4.6 9 4.3 25.3-6 25.3S13.4 18.2 18 9.2z"
        fill="url(#ss-steel)"
        stroke="#39414b"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 7.8l8.2-.4M31 7.4l8.2.4" stroke="#39414b" strokeWidth="2.4" strokeLinecap="round" />
      {[
        [11.5, 16],
        [10.8, 24],
        [13.2, 31.5],
        [36.5, 16],
        [37.2, 24],
        [34.8, 31.5],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 1} y={y - 1.6} width="2" height="3.2" rx="0.8" fill="#2a3038" />
      ))}
      <path d="M13.5 12c-2.4 6-2.6 13 .6 19" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </>
  );
}

const ART: Record<SlotSymbol, () => JSX.Element> = {
  seven: Seven,
  gold: GoldBar,
  eagle: Eagle,
  bison: Bison,
  wagon: Wagon,
  revolver: Revolver,
  moneybag: MoneyBag,
  hat: CowboyHat,
  horseshoe: Horseshoe,
  cactus: Cactus,
  star: SheriffStar,
};

export function SlotSymbolIcon({ symbol, className }: { symbol: SlotSymbol; className?: string }) {
  const Art = ART[symbol];
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <Art />
    </svg>
  );
}
