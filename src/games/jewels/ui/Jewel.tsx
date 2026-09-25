// One jewel on the board. Memoised: it re-renders only when its own kind / special / cell / phase change,
// never because another jewel moved. Positioned with a GPU transform (translate by whole cells), moved by a
// CSS transition, dropped in with one Web Animation on mount. No timers or frames of its own.
import { memo, useLayoutEffect, useRef } from 'react';
import type { Special } from '../engine';

export type JewelPhase = 'idle' | 'clear' | 'pop' | 'hint';

interface JewelProps {
  kind: number;
  special: Special | null;
  r: number;
  c: number;
  phase: JewelPhase;
  selected: boolean;
  /** Row it falls from when it first appears (new jewels drop in from above the board). */
  dropFrom?: number;
  dropMs: number;
}

const at = (r: number, c: number) => `translate3d(${c * 100}%, ${r * 100}%, 0)`;

function JewelViewImpl({ kind, special, r, c, phase, selected, dropFrom, dropMs }: JewelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (dropFrom === undefined || !ref.current?.animate || dropMs <= 0) return;
    ref.current.animate([{ transform: at(dropFrom, c) }, { transform: at(r, c) }], { duration: dropMs, easing: 'cubic-bezier(0.33, 0.9, 0.45, 1.06)' });
    // Only when the jewel first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const symbol = special === 'prism' ? '#jw-prism' : `#jw${kind}`;
  return (
    <div ref={ref} className={`jw${selected ? ' is-sel' : ''}`} style={{ transform: at(r, c) }}>
      <div className={`jw-body jw-${phase}`}>
        <svg viewBox="0 0 100 100" aria-hidden focusable="false">
          {special === 'bomb' && <circle cx="50" cy="50" r="47" fill="url(#jw-bomb-glow)" className="jw-pulse" />}
          <use href={symbol} />
          {special === 'lineH' && (
            <g className="jw-pulse">
              <rect x="4" y="44" width="92" height="5" rx="2.5" fill="url(#jw-beam-h)" />
              <rect x="4" y="53" width="92" height="5" rx="2.5" fill="url(#jw-beam-h)" />
            </g>
          )}
          {special === 'lineV' && (
            <g className="jw-pulse">
              <rect x="44" y="4" width="5" height="92" rx="2.5" fill="url(#jw-beam-v)" />
              <rect x="53" y="4" width="5" height="92" rx="2.5" fill="url(#jw-beam-v)" />
            </g>
          )}
          {special === 'bomb' && <circle cx="50" cy="50" r="44" fill="none" stroke="#ffe3a0" strokeWidth="3" strokeDasharray="6 7" opacity="0.9" />}
        </svg>
      </div>
    </div>
  );
}

// dropFrom / dropMs matter only on mount: changing them later must not re-render the jewel.
export const JewelView = memo(JewelViewImpl, (a, b) => a.kind === b.kind && a.special === b.special && a.r === b.r && a.c === b.c && a.phase === b.phase && a.selected === b.selected);
