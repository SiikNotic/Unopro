// The board: jewels, ice, beams and rings, the spark canvas, and touch input (tap → tap, or swipe).
// One set of pointer handlers for the whole board (no listener per jewel).
import { memo, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useI18n } from '@/i18n';
import type { Pos } from '../engine';
import { JewelView } from './Jewel';
import { SparkLayer } from './particles';
import type { Effect, VPiece } from './useJewelGame';

interface BoardProps {
  rows: number;
  cols: number;
  size: number;
  pieces: VPiece[];
  ice: boolean[][];
  effects: Effect[];
  combo: { id: number; n: number } | null;
  moveMs: number;
  selected: Pos | null;
  busy: boolean;
  sparkCap: number;
  sparks: React.MutableRefObject<SparkLayer | null>;
  onTap: (p: Pos) => void;
  onSwipe: (a: Pos, b: Pos) => void;
}

const IceLayer = memo(function IceLayer({ ice }: { ice: boolean[][] }) {
  return (
    <>
      {ice.flatMap((row, r) => row.map((on, c) => (on ? <span key={`${r}-${c}`} className="jw-ice" style={{ transform: `translate3d(${c * 100}%, ${r * 100}%, 0)` }} /> : null)))}
    </>
  );
});

const Cells = memo(function Cells({ rows, cols }: { rows: number; cols: number }) {
  // One background pattern instead of rows×cols elements.
  return <div className="jw-cells" style={{ backgroundSize: `${100 / cols}% ${100 / rows}%` } as CSSProperties} aria-hidden />;
});

export function JewelBoard({ rows, cols, size, pieces, ice, effects, combo, moveMs, selected, busy, sparkCap, sparks, onTap, onSwipe }: BoardProps) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const cell = size / cols;
  const height = cell * rows;
  const gesture = useRef<{ id: number; x: number; y: number; cell: Pos; done: boolean } | null>(null);

  // The spark layer lives as long as the board; disposed (frame cancelled) on unmount.
  useEffect(() => {
    if (!canvas.current) return;
    const layer = new SparkLayer(canvas.current, sparkCap);
    sparks.current = layer;
    return () => {
      layer.dispose();
      sparks.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => sparks.current?.setCap(sparkCap), [sparkCap, sparks]);
  useEffect(() => sparks.current?.resize(size, height), [size, height, sparks]);

  const cellAt = (e: React.PointerEvent): Pos | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / cell);
    const r = Math.floor((e.clientY - rect.top) / cell);
    return r >= 0 && c >= 0 && r < rows && c < cols ? { r, c } : null;
  };

  return (
    <div
      className={`jw-board${busy ? ' is-busy' : ''}`}
      style={{ width: size, height, '--jw-cols': cols, '--jw-rows': rows, '--jw-move': `${moveMs}ms` } as CSSProperties}
      role="application"
      aria-label={t('jewels.boardAria')}
      onPointerDown={(e) => {
        const p = cellAt(e);
        if (!p) return;
        gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cell: p, done: false };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || g.done || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.32) return;
        g.done = true;
        const to = Math.abs(dx) > Math.abs(dy) ? { r: g.cell.r, c: g.cell.c + Math.sign(dx) } : { r: g.cell.r + Math.sign(dy), c: g.cell.c };
        if (to.r >= 0 && to.c >= 0 && to.r < rows && to.c < cols) onSwipe(g.cell, to);
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        gesture.current = null;
        if (g && !g.done && g.id === e.pointerId) onTap(g.cell);
      }}
      onPointerCancel={() => (gesture.current = null)}
    >
      <Cells rows={rows} cols={cols} />
      <div className="jw-layer">
        <IceLayer ice={ice} />
      </div>
      {selected && <span className="jw-select" style={{ transform: `translate3d(${selected.c * 100}%, ${selected.r * 100}%, 0)` }} aria-hidden />}
      <div className="jw-layer">
        {pieces.map((p) => (
          <JewelView key={p.id} kind={p.kind} special={p.special} r={p.r} c={p.c} phase={p.phase} selected={!!selected && selected.r === p.r && selected.c === p.c} dropFrom={p.dropFrom} dropMs={moveMs} />
        ))}
      </div>
      <div className="jw-fx" aria-hidden>
        {effects.map((f) =>
          f.type === 'row' ? (
            <span key={f.id} className="jw-beam is-row" style={{ top: f.r * cell, height: cell }} />
          ) : f.type === 'col' ? (
            <span key={f.id} className="jw-beam is-col" style={{ left: f.c * cell, width: cell }} />
          ) : (
            <span
              key={f.id}
              className={`jw-ring ${f.type === 'flash' ? 'is-flash' : ''}`}
              style={{ left: (f.c + 0.5) * cell, top: (f.r + 0.5) * cell, width: cell * (f.size ?? 1.5) * 2, height: cell * (f.size ?? 1.5) * 2 }}
            />
          )
        )}
        {combo && combo.n >= 2 && (
          <span key={combo.id} className="jw-combo">
            {t('jewels.cascade', { n: combo.n })}
          </span>
        )}
      </div>
      <canvas ref={canvas} className="jw-sparks" aria-hidden />
    </div>
  );
}
