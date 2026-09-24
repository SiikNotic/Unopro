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

function Horse() {
  return (
    <>
      <defs>
        <linearGradient id="ss-horse" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8672c" />
          <stop offset="1" stopColor="#6a3413" />
        </linearGradient>
      </defs>
      <path
        d="M29 4l3.5 7.5c6 2.5 10 9 10 17.5V45H23c.4-5.5-1.5-10-5.5-12.5-3.5-.4-7 .6-9.6-1C5 29.8 4.6 25.6 7 22.8c3.2-4 7-7.4 12-10.3L25 4.5l1.8 5z"
        fill="url(#ss-horse)"
        stroke="#3a1a07"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* mane */}
      <path d="M32.5 11.5c6 2.5 10 9 10 17.5V42h-3.2c0-10.5-2.3-18.7-8.8-25.3z" fill="#2b170c" />
      <path d="M31 11.5l2.6-3.4M34 13.5l3.2-2.4M37 16.5l3.4-1.4" stroke="#2b170c" strokeWidth="2" strokeLinecap="round" />
      {/* white blaze */}
      <path d="M20.5 13.5c-4 3-7.5 7-9.4 11.2l2.2 1c2-3.9 4.8-7.4 8.4-9.7z" fill="#fbf6ea" />
      {/* eye, nostril, mouth */}
      <circle cx="22.5" cy="17" r="1.5" fill="#1a0c04" />
      <circle cx="22.1" cy="16.5" r="0.45" fill="#fff" />
      <ellipse cx="8.7" cy="26.4" rx="1.2" ry="0.8" fill="#2a1206" />
      <path d="M8.5 30.5c2 .6 4 .5 6-.3" stroke="#3a1a07" strokeWidth="1" fill="none" strokeLinecap="round" />
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
  horse: Horse,
  horseshoe: Horseshoe,
};

export function SlotSymbolIcon({ symbol, className }: { symbol: SlotSymbol; className?: string }) {
  const Art = ART[symbol];
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <Art />
    </svg>
  );
}
