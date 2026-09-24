import { memo, useMemo } from 'react';
import { hashSeed } from '@/games/shared/rng';
import { columnOf, LETTERS } from '../engine';

/** A glossy numbered ball in its column's colour. */
export const Ball = memo(function Ball({ n, className = '', label, size }: { n: number; className?: string; label?: string; size?: number }) {
  return (
    <span className={`bb bg-col-${columnOf(n)} ${className}`} style={size ? ({ '--s': `${size}px` } as React.CSSProperties) : undefined} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className="bb-face">
        <small>{LETTERS[columnOf(n)]}</small>
        <b>{n}</b>
      </span>
    </span>
  );
});

/** The glass cage with balls tumbling inside; it spins while a ball is being drawn. */
export const Cage = memo(function Cage({ rolling }: { rolling: boolean }) {
  const balls = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => {
        const h = hashSeed(`cage${i}`);
        return { x: 8 + (h % 70), y: 10 + ((h >>> 8) % 58), c: i % 5 };
      }),
    []
  );
  return (
    <div className={`bg-cage ${rolling ? 'is-rolling' : ''}`} aria-hidden>
      <div className="bg-globe">
        <div className="bg-tumble">
          {balls.map((b, i) => (
            <i key={i} className={`bg-col-${b.c}`} style={{ left: `${b.x}%`, top: `${b.y}%` }} />
          ))}
        </div>
        <div className="bg-wires" />
      </div>
      <div className="bg-stand" />
    </div>
  );
});

/** Every number 1–75 by column, lit once called. */
export function MasterBoard({ called, label }: { called: number[]; label: string }) {
  const set = new Set(called);
  const last = called[called.length - 1];
  return (
    <div className="bg-board" role="table" aria-label={label}>
      {LETTERS.map((letter, col) => (
        <div key={letter} role="row" style={{ display: 'contents' }}>
          <b className={`bg-col-${col}`} role="rowheader">
            {letter}
          </b>
          {Array.from({ length: 15 }, (_, i) => {
            const n = col * 15 + i + 1;
            return (
              <span key={n} role="cell" className={`bg-col-${col} ${set.has(n) ? 'on' : ''} ${n === last ? 'last' : ''}`} aria-label={set.has(n) ? `${letter}-${n} ✓` : `${letter}-${n}`}>
                {n}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
