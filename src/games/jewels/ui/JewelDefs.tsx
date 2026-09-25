// The jewel artwork, defined once as SVG symbols and drawn with <use> by every cell (no per-jewel
// gradients, no filters: cheap to render 80 of them). Each kind has its own silhouette, so jewels are
// recognisable without colour.
import { memo } from 'react';
import { PALETTES } from './palette';

// Outline, inner facet and facet lines of each cut (viewBox 0 0 100 100).
const CUTS: { outline: string; facet: string; lines: string; shine: string }[] = [
  {
    // Diamond: the classic brilliant, seen from the side (crown + pavilion).
    outline: 'M24 36 L36 18 H64 L76 36 L50 86 Z',
    facet: 'M36 36 L44 22 H56 L64 36 L50 70 Z',
    lines: 'M24 36 H76 M36 18 L44 36 L50 18 L56 36 L64 18 M44 36 L50 86 L56 36',
    shine: 'M38 22 L46 22 L41 33 Z',
  },
  {
    // Emerald: step cut, tall octagon.
    outline: 'M33 12 H67 L80 25 V75 L67 88 H33 L20 75 V25 Z',
    facet: 'M38 24 H62 L69 31 V69 L62 76 H38 L31 69 V31 Z',
    lines: 'M33 12 L38 24 M67 12 L62 24 M80 25 L69 31 M80 75 L69 69 M67 88 L62 76 M33 88 L38 76 M20 75 L31 69 M20 25 L31 31 M42 34 H58 V66 H42 Z',
    shine: 'M36 16 H52 L48 21 H38 Z',
  },
  {
    // Ruby: heart.
    outline: 'M50 87 C22 66 10 50 13 34 C16 19 36 13 50 28 C64 13 84 19 87 34 C90 50 78 66 50 87 Z',
    facet: 'M50 72 C33 59 26 49 28 39 C30 30 42 27 50 37 C58 27 70 30 72 39 C74 49 67 59 50 72 Z',
    lines: 'M50 28 V37 M13 34 L28 39 M87 34 L72 39 M50 87 V72 M28 60 L36 55 M72 60 L64 55',
    shine: 'M22 28 C26 21 34 20 40 25 C33 26 28 29 25 34 Z',
  },
  {
    // Sapphire: pear (teardrop).
    outline: 'M50 9 C63 28 81 45 81 63 C81 80 67 91 50 91 C33 91 19 80 19 63 C19 45 37 28 50 9 Z',
    facet: 'M50 30 C58 42 68 52 68 63 C68 73 60 79 50 79 C40 79 32 73 32 63 C32 52 42 42 50 30 Z',
    lines: 'M50 9 V30 M19 63 H32 M81 63 H68 M50 91 V79 M27 42 L38 48 M73 42 L62 48',
    shine: 'M42 24 C38 32 32 40 30 48 C28 40 34 30 42 24 Z',
  },
  {
    // Amethyst: trillion (triangle).
    outline: 'M50 11 C53 11 55 13 57 16 L88 72 C91 78 88 84 81 84 H19 C12 84 9 78 12 72 L43 16 C45 13 47 11 50 11 Z',
    facet: 'M50 34 L70 72 H30 Z',
    lines: 'M50 11 L50 34 M12 76 L30 72 M88 76 L70 72 M30 72 L50 84 L70 72',
    shine: 'M44 22 L50 16 L38 40 L34 44 Z',
  },
  {
    // Topaz: hexagon.
    outline: 'M50 9 L86 29 V71 L50 91 L14 71 V29 Z',
    facet: 'M50 29 L68 39 V61 L50 71 L32 61 V39 Z',
    lines: 'M50 9 V29 M86 29 L68 39 M86 71 L68 61 M50 91 V71 M14 71 L32 61 M14 29 L32 39',
    shine: 'M22 30 L46 17 L42 23 L25 33 Z',
  },
];

/** Hidden SVG with every jewel symbol; render once per game screen. */
export const JewelDefs = memo(function JewelDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        {PALETTES.map((p, k) => (
          <g key={k}>
            <linearGradient id={`jwb${k}`} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
              <stop offset="0" stopColor={p.hi} />
              <stop offset="0.45" stopColor={p.mid} />
              <stop offset="1" stopColor={p.low} />
            </linearGradient>
            <linearGradient id={`jwf${k}`} x1="0.8" y1="0" x2="0.2" y2="1">
              <stop offset="0" stopColor={p.hi} stopOpacity="0.95" />
              <stop offset="0.5" stopColor={p.mid} stopOpacity="0.85" />
              <stop offset="1" stopColor={p.low} stopOpacity="0.9" />
            </linearGradient>
          </g>
        ))}
        <radialGradient id="jw-prism-core" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#f3e9ff" />
          <stop offset="1" stopColor="#6a4bb8" />
        </radialGradient>
        <radialGradient id="jw-bomb-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor="#ffd98a" stopOpacity="0" />
          <stop offset="0.85" stopColor="#ffd98a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="jw-beam-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="jw-beam-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        {CUTS.map((cut, k) => (
          <symbol key={k} id={`jw${k}`} viewBox="0 0 100 100">
            <ellipse cx="50" cy="93" rx="27" ry="4.5" fill="#000" opacity="0.35" />
            <path d={cut.outline} fill={`url(#jwb${k})`} stroke={PALETTES[k].rim} strokeWidth="2.5" strokeLinejoin="round" />
            <path d={cut.facet} fill={`url(#jwf${k})`} />
            <path d={cut.lines} fill="none" stroke="#fff" strokeOpacity="0.38" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
            <path d={cut.shine} fill="#fff" opacity="0.8" />
            <circle cx="66" cy="30" r="2.2" fill="#fff" opacity="0.9" />
          </symbol>
        ))}

        {/* Prism: a faceted orb holding every colour. */}
        <symbol id="jw-prism" viewBox="0 0 100 100">
          <ellipse cx="50" cy="93" rx="27" ry="4.5" fill="#000" opacity="0.35" />
          <circle cx="50" cy="50" r="38" fill="url(#jw-prism-core)" stroke="#2a1a55" strokeWidth="2.5" />
          <g className="jw-prism-spin">
            {PALETTES.map((p, k) => {
              const a0 = (k / 6) * Math.PI * 2;
              const a1 = ((k + 1) / 6) * Math.PI * 2;
              return <path key={k} d={`M50 50 L${50 + 30 * Math.cos(a0)} ${50 + 30 * Math.sin(a0)} L${50 + 30 * Math.cos(a1)} ${50 + 30 * Math.sin(a1)} Z`} fill={p.mid} opacity="0.75" />;
            })}
          </g>
          <circle cx="50" cy="50" r="12" fill="#fff" opacity="0.85" />
          <path d="M30 32 C36 22 48 18 58 20 C46 24 38 30 34 40 Z" fill="#fff" opacity="0.8" />
        </symbol>
      </defs>
    </svg>
  );
});
