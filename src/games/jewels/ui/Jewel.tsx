// One piece on the board. Memoised: it re-renders only when its own kind / special / cell / phase change,
// never because another piece moved. Positioned with a GPU transform (translate by whole cells), moved by a
// CSS transition, dropped in with one Web Animation on mount. No timers or frames of its own.
import { memo, useLayoutEffect, useRef } from 'react';
import type { Special } from '../engine';
import { STONE_KIND } from '../engine';

export type JewelPhase = 'idle' | 'clear' | 'pop' | 'hint' | 'target' | 'hit';

interface JewelProps {
  kind: number;
  special: Special | null;
  hp?: number;
  r: number;
  c: number;
  phase: JewelPhase;
  selected: boolean;
  /** Some jewels catch the light now and then (decorative; off with reduced motion). */
  glint: boolean;
  /** Row it falls from when it first appears (new jewels drop in from above the board). */
  dropFrom?: number;
  dropMs: number;
}

const at = (r: number, c: number) => `translate3d(${c * 100}%, ${r * 100}%, 0)`;

function JewelViewImpl({ kind, special, hp, r, c, phase, selected, glint, dropFrom, dropMs }: JewelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (dropFrom === undefined || !ref.current?.animate || dropMs <= 0) return;
    ref.current.animate([{ transform: at(dropFrom, c) }, { transform: at(r, c) }], { duration: dropMs, easing: 'cubic-bezier(0.3, 0.9, 0.45, 1.08)' });
    // Only when the piece first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stone = kind === STONE_KIND;
  const symbol = stone ? `#jw-stone${hp === 1 ? 1 : 2}` : special === 'prism' ? '#jw-prism' : `#jw${kind}`;
  return (
    <div ref={ref} className={`jw${selected ? ' is-sel' : ''}${special ? ` is-${special}` : ''}${stone ? ' is-stone' : ''}`} style={{ transform: at(r, c) }}>
      <div className={`jw-body jw-${phase}`}>
        <svg viewBox="0 0 100 100" aria-hidden focusable="false">
          {(special === 'bomb' || special === 'prism') && <circle cx="50" cy="50" r="48" fill="url(#jw-halo)" className="jw-pulse" />}
          <use href={symbol} />
          {(special === 'lineH' || special === 'lineV') && (
            <>
              <use href="#jw-bolt" />
              <g className="jw-pulse" fill="#ffe7a3" stroke="#5a3a06" strokeWidth="1">
                {special === 'lineH' ? (
                  <>
                    <path d="M8 50 L17 43 V57 Z" />
                    <path d="M92 50 L83 43 V57 Z" />
                  </>
                ) : (
                  <>
                    <path d="M50 6 L43 15 H57 Z" />
                    <path d="M50 94 L43 85 H57 Z" />
                  </>
                )}
              </g>
            </>
          )}
          {special === 'bomb' && <use href="#jw-temple" />}
        </svg>
        {glint && !stone && <span className="jw-glint" style={{ animationDelay: `${((r * 3 + c * 5) % 11) * 0.47}s` }} aria-hidden />}
      </div>
    </div>
  );
}

// dropFrom / dropMs matter only on mount: changing them later must not re-render the piece.
export const JewelView = memo(
  JewelViewImpl,
  (a, b) => a.kind === b.kind && a.special === b.special && a.hp === b.hp && a.r === b.r && a.c === b.c && a.phase === b.phase && a.selected === b.selected && a.glint === b.glint
);
