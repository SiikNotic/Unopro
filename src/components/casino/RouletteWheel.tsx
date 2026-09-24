import { memo } from 'react';
import { pocketColor, POCKETS, WHEEL_ORDER } from '@/casino/roulette';

const SLICE = 360 / POCKETS;
const FILL = { red: '#c8202f', black: '#16161f', green: '#138a50' } as const;

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

function wedge(i: number, inner: number, outer: number): string {
  const a0 = i * SLICE - SLICE / 2;
  const a1 = a0 + SLICE;
  const [x0, y0] = polar(outer, a0);
  const [x1, y1] = polar(outer, a1);
  const [x2, y2] = polar(inner, a1);
  const [x3, y3] = polar(inner, a0);
  return `M${x0} ${y0}A${outer} ${outer} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${inner} ${inner} 0 0 0 ${x3} ${y3}Z`;
}

/** Static pockets, drawn once. */
const Pockets = memo(function Pockets({ highlight }: { highlight: number | null }) {
  return (
    <>
      {WHEEL_ORDER.map((n, i) => (
        <g key={n}>
          <path d={wedge(i, 64, 96)} fill={FILL[pocketColor(n)]} stroke="#c9a24a" strokeWidth="0.6" />
          <text
            x="0"
            y="-84"
            transform={`rotate(${i * SLICE})`}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="9"
            fontWeight="800"
            fill={highlight === n ? '#f5c451' : '#fff'}
            style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}
          >
            {n}
          </text>
        </g>
      ))}
    </>
  );
});

interface RouletteWheelProps {
  rotorDeg: number;
  ballDeg: number;
  durationMs: number;
  highlight: number | null;
  size: number;
  label: string;
}

/** European wheel. The rotor and the ball are rotated by the parent; both ease out to rest together. */
export function RouletteWheel({ rotorDeg, ballDeg, durationMs, highlight, size, label }: RouletteWheelProps) {
  const ease = `transform ${durationMs}ms cubic-bezier(0.12, 0.65, 0.18, 1)`;
  return (
    <svg viewBox="-110 -114 220 224" width={size} height={size} role="img" aria-label={label} className="drop-shadow-[0_18px_30px_rgba(0,0,0,0.7)]">
      <defs>
        <radialGradient id="rw-wood" r="0.7">
          <stop offset="0.75" stopColor="#5a3722" />
          <stop offset="1" stopColor="#1c0f08" />
        </radialGradient>
        <radialGradient id="rw-cone" r="0.6">
          <stop offset="0" stopColor="#7a4a2a" />
          <stop offset="1" stopColor="#2b170c" />
        </radialGradient>
      </defs>
      <circle r="108" fill="url(#rw-wood)" stroke="#c9a24a" strokeWidth="2" />
      <circle r="98" fill="#241208" />
      <g style={{ transform: `rotate(${rotorDeg}deg)`, transition: ease }}>
        <Pockets highlight={highlight} />
        <circle r="64" fill="url(#rw-cone)" stroke="#c9a24a" strokeWidth="1.2" />
        {[0, 90, 180, 270].map((a) => (
          <path key={a} d="M0 -6 L3 -40 L0 -44 L-3 -40 Z" transform={`rotate(${a})`} fill="#e6c77a" stroke="#8a6421" strokeWidth="0.6" />
        ))}
        <circle r="10" fill="#e6c77a" stroke="#8a6421" strokeWidth="1" />
      </g>
      <g style={{ transform: `rotate(${ballDeg}deg)`, transition: ease }}>
        <circle cy="-73" r="5" fill="#fff" stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
        <circle cx="-1.5" cy="-74.5" r="1.6" fill="rgba(255,255,255,0.9)" />
      </g>
      {/* marker */}
      <path d="M0 -99 L-6 -112 L6 -112 Z" fill="#f5c451" stroke="#8a6421" strokeWidth="1" />
    </svg>
  );
}
