// The game's picture for lists and the Home card: a rack of balls on green cloth with a gold rim (drawn, no files).
import { useId } from 'react';

export function BilliardsArt({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  const balls: [number, number, string, boolean][] = [
    [24, 14, '#f2c230', false],
    [19.5, 21.8, '#1d4fd1', true],
    [28.5, 21.8, '#c8202c', false],
    [15, 29.6, '#6a2bc4', false],
    [24, 29.6, '#0b0b0d', false],
    [33, 29.6, '#e8731c', true],
  ];
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`c${id}`} cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#1e8a57" />
          <stop offset="1" stopColor="#08321f" />
        </radialGradient>
        <radialGradient id={`s${id}`} cx="0.32" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#3a2212" stroke="#d9a441" strokeWidth="1.6" />
      <rect x="6" y="6" width="36" height="36" rx="6" fill={`url(#c${id})`} />
      {balls.map(([x, y, c, stripe], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4.4" fill={stripe ? '#f6f2e6' : c} />
          {stripe && <rect x={x - 4.4} y={y - 2} width="8.8" height="4" fill={c} clipPath={`circle(4.4px at ${x}px ${y}px)`} />}
          <circle cx={x} cy={y} r="1.7" fill="#fff" opacity={i === 4 ? 1 : 0.92} />
          <circle cx={x} cy={y} r="4.4" fill={`url(#s${id})`} />
        </g>
      ))}
      <circle cx="24" cy="38.5" r="4" fill="#f8f6ef" />
      <circle cx="24" cy="38.5" r="4" fill={`url(#s${id})`} />
    </svg>
  );
}
