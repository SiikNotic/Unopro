// Original iconography for the cards: one filled suit per color (so color is never the only cue)
// and a family of action glyphs drawn with the same stroke weight.
import type { CardColor } from '@/game/engine';
import { SUIT_PATHS } from './suitPaths';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SuitIcon({ color, className, style }: IconProps & { color: CardColor }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden fill="currentColor">
      <path d={SUIT_PATHS[color]} />
    </svg>
  );
}

export function SkipGlyph({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round">
      <circle cx="24" cy="24" r="16" />
      <path d="M13 35 35 13" />
    </svg>
  );
}

export function ReverseGlyph({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden fill="none" stroke="currentColor" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 21a14 14 0 0 1 24-8" />
      <path d="M35 6v8h-8" />
      <path d="M38 27a14 14 0 0 1-24 8" />
      <path d="M13 42v-8h8" />
    </svg>
  );
}

const WHEEL: [CardColor, string][] = [
  ['RED', 'var(--pc-red)'],
  ['YELLOW', 'var(--pc-yellow)'],
  ['GREEN', 'var(--pc-green)'],
  ['BLUE', 'var(--pc-blue)'],
];

/** Four-color pinwheel: the Wild emblem. Each blade carries its suit so it reads without color. */
export function WildWheel({ className, style, withSuits = true }: IconProps & { withSuits?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden>
      {WHEEL.map(([color, fill], i) => (
        <g key={color} transform={`rotate(${i * 90} 24 24)`}>
          <path d="M24 24 L24 3 A21 21 0 0 1 45 24 Z" fill={fill} stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinejoin="round" />
          {withSuits && (
            <path d={SUIT_PATHS[color]} fill="rgba(255,255,255,0.9)" transform="translate(29.5 7.5) scale(0.42)" />
          )}
        </g>
      ))}
      <circle cx="24" cy="24" r="5" fill="#fff" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
    </svg>
  );
}
