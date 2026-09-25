// The world behind the board: sky and divine light (background), floating islands with temples and the
// great temple on its cloud stairs (midground), and clouds and columns (foreground, around the board).
// SVG and CSS gradients over one small painted panorama: no blur filters, no frame loop — the only motion is a few
// slow CSS transforms (the light turning, clouds drifting), removed with reduced motion.
import { memo } from 'react';
import { PANORAMA_IMAGE } from './assets';

/** A small Greek temple: steps, columns, entablature and pediment. */
function Temple({ x, y, w, cols = 6, tone = '#f4efe4', shade = '#c9bfae' }: { x: number; y: number; w: number; cols?: number; tone?: string; shade?: string }) {
  const h = w * 0.62;
  const colW = w / (cols * 2 + 1);
  return (
    <g>
      <path d={`M${x - w * 0.06} ${y} H${x + w * 1.06} V${y - h * 0.06} H${x - w * 0.06} Z`} fill={shade} />
      <path d={`M${x - w * 0.03} ${y - h * 0.06} H${x + w * 1.03} V${y - h * 0.12} H${x - w * 0.03} Z`} fill={tone} />
      {Array.from({ length: cols }, (_, i) => (
        <rect key={i} x={x + colW * (1 + i * 2)} y={y - h * 0.74} width={colW} height={h * 0.62} fill={i % 2 ? tone : '#fffaf0'} />
      ))}
      <path d={`M${x - w * 0.02} ${y - h * 0.74} H${x + w * 1.02} V${y - h * 0.84} H${x - w * 0.02} Z`} fill={shade} />
      <path d={`M${x - w * 0.05} ${y - h * 0.84} L${x + w / 2} ${y - h * 1.08} L${x + w * 1.05} ${y - h * 0.84} Z`} fill={tone} />
      <path d={`M${x + w * 0.12} ${y - h * 0.87} L${x + w / 2} ${y - h * 1.02} L${x + w * 0.88} ${y - h * 0.87} Z`} fill="#e0b85c" opacity="0.55" />
    </g>
  );
}

/** A soft cloud from overlapping puffs (no blur: layered gradients). */
function Cloud({ x, y, s, opacity = 1 }: { x: number; y: number; s: number; opacity?: number }) {
  const puffs: [number, number, number][] = [
    [0, 0, 1],
    [0.9, -0.35, 1.2],
    [1.9, -0.1, 0.95],
    [2.7, 0.15, 0.8],
    [-0.8, 0.2, 0.75],
  ];
  return (
    <g opacity={opacity}>
      {puffs.map(([dx, dy, r], i) => (
        <circle key={i} cx={x + dx * s} cy={y + dy * s} r={r * s} fill="url(#ol-cloud)" />
      ))}
    </g>
  );
}

/** A floating island: rock, grass, a temple and a thin waterfall. */
function Island({ x, y, w, fall = true }: { x: number; y: number; w: number; fall?: boolean }) {
  return (
    <g>
      {fall && <rect x={x + w * 0.62} y={y + 2} width={w * 0.05} height={w * 1.1} fill="url(#ol-fall)" />}
      <path d={`M${x} ${y} C${x + w * 0.2} ${y + w * 0.5} ${x + w * 0.45} ${y + w * 0.75} ${x + w * 0.5} ${y + w * 0.95} C${x + w * 0.6} ${y + w * 0.6} ${x + w * 0.85} ${y + w * 0.45} ${x + w} ${y} Z`} fill="url(#ol-rock)" />
      <path d={`M${x - w * 0.02} ${y + 2} C${x + w * 0.3} ${y - w * 0.06} ${x + w * 0.7} ${y - w * 0.06} ${x + w * 1.02} ${y + 2} Z`} fill="#6f9c5a" />
      <Temple x={x + w * 0.24} y={y - 1} w={w * 0.52} cols={4} />
    </g>
  );
}

export const OlympusScene = memo(function OlympusScene() {
  return (
    <div className="ol-scene" aria-hidden>
      <div className="ol-sky" />
      <div className="ol-vista" style={{ backgroundImage: `url(${PANORAMA_IMAGE})` }} />
      <div className="ol-rays" />
      <svg className="ol-far" viewBox="0 0 400 700" preserveAspectRatio="xMidYMin slice">
        <defs>
          <radialGradient id="ol-cloud" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.6" stopColor="#eef3ff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#c7d6f2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ol-rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8c7a66" />
            <stop offset="1" stopColor="#2e2a33" />
          </linearGradient>
          <linearGradient id="ol-fall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dff1ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#dff1ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ol-stairs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbf6ea" />
            <stop offset="1" stopColor="#cfc4ae" />
          </linearGradient>
        </defs>
        <g className="ol-drift-a">
          <Island x={20} y={200} w={70} />
          <Cloud x={30} y={290} s={16} opacity={0.8} />
        </g>
        <g className="ol-drift-b">
          <Island x={300} y={160} w={80} />
          <Cloud x={300} y={250} s={18} opacity={0.8} />
        </g>
        {/* The great temple above its cloud stairs. */}
        <g>
          <path d="M150 190 L250 190 L290 330 L110 330 Z" fill="url(#ol-stairs)" opacity="0.9" />
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${150 - i * 4.4} ${190 + i * 15.5} H${250 + i * 4.4}`} stroke="#b8ab92" strokeWidth="1.2" opacity="0.7" />
          ))}
          <Temple x={140} y={192} w={120} cols={6} />
          <circle cx="200" cy="140" r="46" fill="#fff4cf" opacity="0.28" />
        </g>
        <Cloud x={60} y={345} s={24} opacity={0.95} />
        <Cloud x={250} y={350} s={26} opacity={0.95} />
      </svg>
      <div className="ol-glow" />
      <svg className="ol-near" viewBox="0 0 400 700" preserveAspectRatio="xMidYMax slice">
        {/* Columns framing the stage (visible on wide screens). */}
        <g className="ol-columns">
          <rect x="4" y="260" width="30" height="440" fill="url(#ol-stairs)" />
          <rect x="0" y="250" width="38" height="14" fill="#e8dfcc" />
          <rect x="366" y="260" width="30" height="440" fill="url(#ol-stairs)" />
          <rect x="362" y="250" width="38" height="14" fill="#e8dfcc" />
          {[12, 20, 26, 374, 382, 388].map((x) => (
            <path key={x} d={`M${x} 266 V700`} stroke="#bdb09a" strokeWidth="1.4" />
          ))}
        </g>
        <g className="ol-drift-c">
          <Cloud x={-10} y={690} s={40} />
          <Cloud x={150} y={705} s={44} />
          <Cloud x={320} y={690} s={40} />
        </g>
      </svg>
      <div className="ol-dust">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 1.7) % 9}s`, animationDuration: `${9 + (i % 5) * 2}s` }} />
        ))}
      </div>
    </div>
  );
});
