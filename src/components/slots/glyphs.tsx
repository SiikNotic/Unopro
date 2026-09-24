/* eslint-disable react-refresh/only-export-components -- a registry of small glyph components */
// Hand-drawn symbol glyphs (viewBox 0 0 100 100). Colours come from the props so each machine's
// symbol style (printed ink, cut gems, struck gold, embers, neon…) can paint them its own way.
import { useId } from 'react';
import type { ReactElement } from 'react';

export interface GlyphProps {
  /** Main colour (light end of gradients). */
  c1: string;
  /** Shade colour (dark end). */
  c2: string;
  /** Outline / ink colour. */
  ink?: string;
}

type Glyph = (p: GlyphProps) => ReactElement;

function Grad({ id, c1, c2, angle = 135 }: { id: string; c1: string; c2: string; angle?: number }) {
  const r = (angle * Math.PI) / 180;
  return (
    <linearGradient id={id} x1={0.5 - Math.cos(r) / 2} y1={0.5 - Math.sin(r) / 2} x2={0.5 + Math.cos(r) / 2} y2={0.5 + Math.sin(r) / 2}>
      <stop offset="0" stopColor={c1} />
      <stop offset="1" stopColor={c2} />
    </linearGradient>
  );
}

const svg = (children: ReactElement | ReactElement[]) => (
  <svg viewBox="0 0 100 100" className="ps-glyph" aria-hidden focusable="false">
    {children}
  </svg>
);

/** Brilliant-cut diamond, seen from the side: table, crown facets, pavilion. */
const Brilliant: Glyph = ({ c1, c2, ink = '#0b1a33' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={100} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M22 36 L34 20 H66 L78 36 L50 86 Z" fill={`url(#${id})`} />
      <path d="M22 36 H78 M34 20 L42 36 L50 20 L58 36 L66 20 M42 36 L50 86 L58 36" fill="none" />
      <path d="M34 20 L42 36 L22 36 Z" fill="#fff" opacity=".45" />
      <path d="M58 36 L66 20 L78 36 Z" fill="#000" opacity=".12" />
      <path d="M42 36 L50 86 L22 36 Z" fill="#fff" opacity=".18" />
    </g>,
  ]);
};

/** Step-cut emerald: octagon with concentric steps. */
const EmeraldCut: Glyph = ({ c1, c2, ink = '#062a1e' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M32 16 H68 L82 30 V70 L68 84 H32 L18 70 V30 Z" fill={`url(#${id})`} />
      <path d="M38 27 H62 L71 36 V64 L62 73 H38 L29 64 V36 Z" fill="#fff" fillOpacity=".12" />
      <path d="M43 37 H57 L61 41 V59 L57 63 H43 L39 59 V41 Z" fill="#fff" fillOpacity=".22" />
      <path d="M32 16 L38 27 M68 16 L62 27 M82 30 L71 36 M82 70 L71 64 M68 84 L62 73 M32 84 L38 73 M18 70 L29 64 M18 30 L29 36" fill="none" />
    </g>,
  ]);
};

/** Oval cut (ruby). */
const OvalCut: Glyph = ({ c1, c2, ink = '#3a0610' }) => {
  const id = useId();
  return svg([
    <defs key="d"><radialGradient id={id} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></radialGradient></defs>,
    <g key="g" stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
      <ellipse cx="50" cy="50" rx="30" ry="38" fill={`url(#${id})`} />
      <path d="M50 12 L38 32 L50 50 L62 32 Z M20 50 L38 32 M80 50 L62 32 M20 50 L38 68 L50 50 L62 68 L80 50 M50 88 L38 68 M50 88 L62 68" fill="#fff" fillOpacity=".1" />
      <path d="M50 12 L38 32 L50 50 Z" fill="#fff" opacity=".4" stroke="none" />
    </g>,
  ]);
};

/** Cushion cut (sapphire). */
const CushionCut: Glyph = ({ c1, c2, ink = '#08163d' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
      <rect x="17" y="17" width="66" height="66" rx="18" fill={`url(#${id})`} />
      <path d="M50 17 L33 33 L17 50 L33 67 L50 83 L67 67 L83 50 L67 33 Z" fill="#fff" fillOpacity=".12" />
      <path d="M33 33 L50 50 L67 33 M33 67 L50 50 L67 67" fill="none" />
      <path d="M50 17 L33 33 L50 50 Z" fill="#fff" opacity=".35" stroke="none" />
    </g>,
  ]);
};

/** Solitaire ring. */
const Ring: Glyph = ({ c1, c2, ink = '#3b2a0a' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={90} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
      <ellipse cx="50" cy="62" rx="27" ry="24" fill="none" stroke={`url(#${id})`} strokeWidth="9" />
      <ellipse cx="50" cy="62" rx="27" ry="24" fill="none" />
      <path d="M38 34 L44 22 H56 L62 34 L50 46 Z" fill="#eaf6ff" />
      <path d="M38 34 H62 M44 22 L50 34 L56 22 M50 34 V46" fill="none" />
    </g>,
  ]);
};

/** Struck gold coin with a star. */
const Coin: Glyph = ({ c1, c2, ink = '#5a3a05' }) => {
  const id = useId();
  return svg([
    <defs key="d"><radialGradient id={id} cx=".35" cy=".3" r=".85"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></radialGradient></defs>,
    <circle key="a" cx="50" cy="50" r="38" fill={`url(#${id})`} stroke={ink} strokeWidth="2" />,
    <circle key="b" cx="50" cy="50" r="30" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="2 3" opacity=".7" />,
    <path key="c" d="M50 30 L55.9 42 L69 43.8 L59.5 53 L61.8 66 L50 59.8 L38.2 66 L40.5 53 L31 43.8 L44.1 42 Z" fill={c1} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />,
  ]);
};

/** Stacked gold ingot. */
const Ingot: Glyph = ({ c1, c2, ink = '#4a3004' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={90} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.8" strokeLinejoin="round">
      <path d="M14 70 L24 52 H56 L66 70 Z" fill={`url(#${id})`} />
      <path d="M34 70 L44 52 H76 L86 70 Z" fill={`url(#${id})`} />
      <path d="M24 50 L34 32 H66 L76 50 Z" fill={`url(#${id})`} />
      <path d="M24 52 H56 M44 52 H76 M34 32 H66" fill="none" stroke="#fff" strokeOpacity=".6" />
    </g>,
  ]);
};

/** Golden idol: a stylised head with a tall headdress. */
const Idol: Glyph = ({ c1, c2, ink = '#3a2502' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={100} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" fill={`url(#${id})`}>
      <path d="M30 40 L26 12 L40 24 L50 8 L60 24 L74 12 L70 40 Z" />
      <path d="M30 40 H70 V64 Q70 86 50 90 Q30 86 30 64 Z" />
      <path d="M38 54 H46 M54 54 H62 M44 72 H56" fill="none" strokeWidth="3" />
      <path d="M50 58 V66" fill="none" strokeWidth="2" />
      <circle cx="50" cy="30" r="4" fill="#9ef0d2" />
    </g>,
  ]);
};

/** Scarab. */
const Scarab: Glyph = ({ c1, c2, ink = '#062b20' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.8" strokeLinejoin="round">
      <path d="M34 34 L18 26 M66 34 L82 26 M32 52 L14 52 M68 52 L86 52 M34 68 L20 80 M66 68 L80 80" fill="none" strokeWidth="3" />
      <ellipse cx="50" cy="24" rx="12" ry="9" fill={`url(#${id})`} />
      <ellipse cx="50" cy="56" rx="22" ry="28" fill={`url(#${id})`} />
      <path d="M50 30 V84" fill="none" />
      <circle cx="50" cy="12" r="6" fill="#ffd34d" />
    </g>,
  ]);
};

/** Ceremonial gold mask (wild). */
const Mask: Glyph = ({ c1, c2, ink = '#3a2502' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={100} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.8" strokeLinejoin="round">
      <path d="M50 10 L78 22 L80 54 Q76 82 50 92 Q24 82 20 54 L22 22 Z" fill={`url(#${id})`} />
      <path d="M30 46 Q38 38 46 46 Q38 52 30 46 Z M54 46 Q62 38 70 46 Q62 52 54 46 Z" fill="#1a1204" />
      <path d="M40 72 Q50 78 60 72" fill="none" strokeWidth="3" />
      <path d="M22 22 L50 32 L78 22" fill="none" />
    </g>,
  ]);
};

/** Dragon head in profile. */
const Dragon: Glyph = ({ c1, c2, ink = '#2a0500' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={120} /></defs>,
    <g key="g" stroke={ink} strokeWidth="2" strokeLinejoin="round">
      <path d="M22 78 Q16 50 30 32 L26 12 L42 26 L50 14 L54 30 Q72 30 86 44 L88 54 L70 56 L84 64 L66 70 Q54 72 46 66 L40 84 Z" fill={`url(#${id})`} />
      <path d="M58 42 L66 40" stroke="#fff4c2" strokeWidth="3" />
      <path d="M70 56 L60 58 M84 64 L74 62" fill="none" />
      <path d="M30 40 Q36 52 32 64" fill="none" strokeOpacity=".6" />
    </g>,
  ]);
};

/** Volcano (scatter). */
const Volcano: Glyph = ({ c1, c2, ink = '#1c0602' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={90} /></defs>,
    <g key="g" stroke={ink} strokeWidth="2" strokeLinejoin="round">
      <path d="M40 30 Q44 18 36 8 Q52 14 50 26 Q58 12 70 10 Q60 22 60 30 Z" fill="#ffb020" />
      <path d="M8 88 L38 34 H62 L92 88 Z" fill="#3a2a26" />
      <path d="M38 34 H62 L56 50 L60 64 L50 58 L44 72 L42 54 Z" fill={`url(#${id})`} />
    </g>,
  ]);
};

/** Drop of lava. */
const Lava: Glyph = ({ c1, c2, ink = '#2a0500' }) => {
  const id = useId();
  return svg([
    <defs key="d"><radialGradient id={id} cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#fff1c1" /><stop offset=".35" stopColor={c1} /><stop offset="1" stopColor={c2} /></radialGradient></defs>,
    <path key="p" d="M50 10 Q76 46 76 62 A26 26 0 0 1 24 62 Q24 46 50 10 Z" fill={`url(#${id})`} stroke={ink} strokeWidth="2" />,
    <path key="q" d="M38 60 Q40 72 50 76" fill="none" stroke="#fff1c1" strokeWidth="3" strokeLinecap="round" opacity=".7" />,
  ]);
};

/** Desert island with a palm (scatter). */
const Island: Glyph = ({ c1, c2, ink = '#083d4f' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={90} /></defs>,
    <circle key="s" cx="72" cy="24" r="10" fill="#ffd24a" />,
    <path key="w" d="M6 78 Q20 72 34 78 T62 78 T94 78 V94 H6 Z" fill="#0fb5ae" />,
    <path key="i" d="M18 78 Q50 56 82 78 Z" fill="#f3d9a4" stroke={ink} strokeWidth="1.6" />,
    <path key="t" d="M52 70 Q50 48 46 34" fill="none" stroke="#7a4a1f" strokeWidth="4" strokeLinecap="round" />,
    <path key="l" d="M46 34 Q32 26 20 34 Q32 30 44 38 Q40 22 28 16 Q44 20 48 34 Q56 20 72 22 Q58 26 50 36 Q66 32 74 42 Q60 36 48 38" fill={`url(#${id})`} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />,
  ]);
};

/** Treasure chest (scatter). */
const Chest: Glyph = ({ c1, c2, ink = '#2b1d14' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={90} /></defs>,
    <g key="g" stroke={ink} strokeWidth="2" strokeLinejoin="round">
      <path d="M14 42 Q14 20 50 20 Q86 20 86 42 Z" fill="#8b5a2b" />
      <rect x="14" y="42" width="72" height="40" fill="#6b4423" />
      <path d="M14 42 H86 M26 20 V82 M74 20 V82" fill="none" stroke={`url(#${id})`} strokeWidth="6" />
      <rect x="43" y="46" width="14" height="16" rx="2" fill={`url(#${id})`} />
      <circle cx="50" cy="54" r="2.5" fill={ink} />
    </g>,
  ]);
};

/** Pirate captain: skull in a tricorn hat. */
const Captain: Glyph = ({ c1, c2, ink = '#2b1d14' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={90} /></defs>,
    <g key="g" stroke={ink} strokeWidth="2.2" strokeLinejoin="round">
      <path d="M30 56 Q30 34 50 34 Q70 34 70 56 Q70 66 62 70 V80 H38 V70 Q30 66 30 56 Z" fill="#f1e4c3" />
      <circle cx="42" cy="56" r="6" fill={ink} />
      <circle cx="58" cy="56" r="6" fill={ink} />
      <path d="M46 72 V80 M50 72 V80 M54 72 V80" fill="none" />
      <path d="M8 38 Q30 30 50 12 Q70 30 92 38 Q70 44 50 38 Q30 44 8 38 Z" fill={`url(#${id})`} />
      <path d="M44 26 L56 26 M50 20 V32" stroke="#f1e4c3" strokeWidth="3" />
    </g>,
  ]);
};

/** Alien head. */
const Alien: Glyph = ({ c1, c2, ink = '#020b12' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={100} /></defs>,
    <path key="h" d="M50 10 Q84 12 84 44 Q84 70 50 90 Q16 70 16 44 Q16 12 50 10 Z" fill={`url(#${id})`} stroke={ink} strokeWidth="2" />,
    <path key="e1" d="M26 44 Q36 38 46 52 Q34 60 26 44 Z" fill={ink} />,
    <path key="e2" d="M74 44 Q64 38 54 52 Q66 60 74 44 Z" fill={ink} />,
    <path key="m" d="M44 74 Q50 76 56 74" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />,
  ]);
};

/** Ringed planet. */
const Planet: Glyph = ({ c1, c2 }) => {
  const id = useId();
  return svg([
    <defs key="d"><radialGradient id={id} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></radialGradient></defs>,
    <ellipse key="rb" cx="50" cy="52" rx="44" ry="12" fill="none" stroke={c1} strokeWidth="4" opacity=".6" transform="rotate(-18 50 52)" />,
    <circle key="p" cx="50" cy="50" r="26" fill={`url(#${id})`} />,
    <path key="rf" d="M8 64 Q50 44 92 38" fill="none" stroke={c1} strokeWidth="4" transform="rotate(-2 50 52)" />,
  ]);
};

/** Portal ring (scatter). */
const Portal: Glyph = ({ c1, c2 }) => {
  const id = useId();
  return svg([
    <defs key="d"><radialGradient id={id} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff" /><stop offset=".45" stopColor={c1} /><stop offset="1" stopColor={c2} stopOpacity="0" /></radialGradient></defs>,
    <circle key="g" cx="50" cy="50" r="44" fill={`url(#${id})`} />,
    <circle key="a" cx="50" cy="50" r="32" fill="none" stroke={c1} strokeWidth="4" strokeDasharray="14 8" />,
    <circle key="b" cx="50" cy="50" r="20" fill="none" stroke={c2} strokeWidth="3" strokeDasharray="6 6" />,
  ]);
};

/** Comet. */
const Comet: Glyph = ({ c1, c2 }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c2} c2={c1} angle={45} /></defs>,
    <path key="t" d="M12 12 L70 58 L58 70 Z" fill={`url(#${id})`} opacity=".85" />,
    <circle key="c" cx="68" cy="68" r="16" fill={c1} />,
    <circle key="h" cx="63" cy="63" r="5" fill="#fff" />,
  ]);
};

/** Royal wax seal with an R (wild). */
const Seal: Glyph = ({ c1, c2, ink = '#2a0610' }) => {
  const id = useId();
  return svg([
    <defs key="d"><radialGradient id={id} cx=".35" cy=".3" r=".85"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></radialGradient></defs>,
    <path key="s" d="M50 8 L60 16 L73 14 L77 26 L89 32 L85 45 L92 56 L82 64 L82 77 L69 79 L61 90 L50 84 L39 90 L31 79 L18 77 L18 64 L8 56 L15 45 L11 32 L23 26 L27 14 L40 16 Z" fill={`url(#${id})`} stroke={ink} strokeWidth="1.6" />,
    <text key="t" x="50" y="62" textAnchor="middle" fontFamily="'Limelight', Georgia, serif" fontSize="36" fill="#f1dfae" stroke={ink} strokeWidth=".8">R</text>,
  ]);
};

/** Royal crest: shield under a crown (scatter / jackpot). */
const Crest: Glyph = ({ c1, c2, ink = '#1a1204' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={100} /></defs>,
    <g key="g" stroke={ink} strokeWidth="1.8" strokeLinejoin="round">
      <path d="M28 30 L24 10 L38 20 L50 6 L62 20 L76 10 L72 30 Z" fill={`url(#${id})`} />
      <path d="M26 34 H74 V58 Q74 82 50 94 Q26 82 26 58 Z" fill="#5a0f1e" />
      <path d="M26 34 H74 V58 Q74 82 50 94 Q26 82 26 58 Z" fill="none" stroke={`url(#${id})`} strokeWidth="4" />
      <path d="M50 42 V84 M34 58 H66" stroke={`url(#${id})`} strokeWidth="4" />
    </g>,
  ]);
};

/** Classic 7 (printed or struck). */
const Seven: Glyph = ({ c1, c2, ink = '#1a0003' }) => {
  const id = useId();
  return svg([
    <defs key="d"><Grad id={id} c1={c1} c2={c2} angle={90} /></defs>,
    <path key="p" d="M20 14 H82 V28 Q58 52 50 90 H30 Q38 54 60 30 H20 Z" fill={`url(#${id})`} stroke={ink} strokeWidth="4" strokeLinejoin="round" />,
  ]);
};

export const GLYPHS: Record<string, Glyph> = {
  brilliant: Brilliant,
  emeraldCut: EmeraldCut,
  ovalCut: OvalCut,
  cushionCut: CushionCut,
  ring: Ring,
  coin: Coin,
  ingot: Ingot,
  idol: Idol,
  scarab: Scarab,
  mask: Mask,
  dragon: Dragon,
  volcano: Volcano,
  lava: Lava,
  island: Island,
  chest: Chest,
  captain: Captain,
  alien: Alien,
  planet: Planet,
  portal: Portal,
  comet: Comet,
  seal: Seal,
  crest: Crest,
  seven: Seven,
};
