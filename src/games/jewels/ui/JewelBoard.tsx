// The board: marble-and-gold frame, crystal, jewels, lightning / waves / divine light, score pops, the spark
// canvas, and touch input (tap → tap, or swipe). One set of pointer handlers for the whole board (no
// listener per jewel).
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useI18n } from '@/i18n';
import type { Booster, Pos } from '../engine';
import { JewelView } from './Jewel';
import { Board3D } from './Board3D';
import { canUse3D } from './three/support';
import { SparkLayer } from './particles';
import type { Effect, ScorePop, VPiece } from './useJewelGame';

interface BoardProps {
  rows: number;
  cols: number;
  size: number;
  pieces: VPiece[];
  ice: boolean[][];
  effects: Effect[];
  pops: ScorePop[];
  combo: { id: number; n: number } | null;
  moveMs: number;
  selected: Pos | null;
  armed: Booster | null;
  busy: boolean;
  glints: boolean;
  celebrate: boolean;
  sparkCap: number;
  sparks: React.MutableRefObject<SparkLayer | null>;
  onTap: (p: Pos) => void;
  onSwipe: (a: Pos, b: Pos) => void;
}

const IceLayer = memo(function IceLayer({ ice }: { ice: boolean[][] }) {
  return <>{ice.flatMap((row, r) => row.map((on, c) => (on ? <span key={`${r}-${c}`} className="jw-ice" style={{ transform: `translate3d(${c * 100}%, ${r * 100}%, 0)` }} /> : null)))}</>;
});

const Cells = memo(function Cells({ rows, cols }: { rows: number; cols: number }) {
  // One background pattern instead of rows×cols elements.
  return <div className="jw-cells" style={{ backgroundSize: `${(100 / cols) * 2}% ${(100 / rows) * 2}%` } as CSSProperties} aria-hidden />;
});

/** A jagged lightning path across `len` cells (deterministic per effect id). */
function boltPath(id: number, len: number): string {
  const n = Math.max(6, len * 2);
  let seed = id * 9301 + 49297;
  const rnd = () => ((seed = (seed * 233280 + 49297) % 1000003) / 1000003) * 2 - 1;
  const pts = Array.from({ length: n + 1 }, (_, i) => `${((i / n) * 100).toFixed(1)} ${(50 + (i === 0 || i === n ? 0 : rnd() * 34)).toFixed(1)}`);
  return `M${pts.join(' L')}`;
}

const Bolt = memo(function Bolt({ e, cell, rows, cols }: { e: Effect; cell: number; rows: number; cols: number }) {
  const row = e.type === 'boltRow';
  const d = useMemo(() => boltPath(e.id, row ? cols : rows), [e.id, row, cols, rows]);
  const style: CSSProperties = row ? { top: e.r * cell, left: 0, width: cols * cell, height: cell } : { left: e.c * cell, top: 0, width: rows * cell, height: cell, transform: `rotate(90deg) translateY(-100%)`, transformOrigin: 'top left' };
  return (
    <svg className="jw-bolt" style={style} viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d={d} className="jw-bolt-glow" />
      <path d={d} className="jw-bolt-core" />
    </svg>
  );
});

/** The frame's rim around a board `size` px wide (the frame art's rim is ~8.5% of its width per side). */
function framePadding(size: number) {
  const w = size / (1 - 0.168);
  return `${w * 0.086}px ${w * 0.084}px ${w * 0.09}px`;
}

export function JewelBoard(props: BoardProps) {
  const { rows, cols, size, pieces, ice, effects, pops, combo, moveMs, selected, armed, busy, glints, celebrate, sparkCap, sparks, onTap, onSwipe } = props;
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const cell = size / cols;
  const height = cell * rows;
  const gesture = useRef<{ id: number; x: number; y: number; cell: Pos; done: boolean } | null>(null);
  // 3D pieces when WebGL is there; the DOM jewels until it is ready (and as the fallback).
  const [use3D] = useState(canUse3D);
  const [ready3D, setReady3D] = useState(false);

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
    <div className={`ol-frame${celebrate ? ' is-celebrate' : ''}`} style={{ '--cell': `${cell}px`, padding: framePadding(size) } as CSSProperties}>
      <div
        className={`jw-board${busy ? ' is-busy' : ''}${armed ? ` is-armed is-${armed}` : ''}`}
        style={{ width: size, height, '--jw-cols': cols, '--jw-rows': rows, '--jw-move': `${moveMs}ms` } as CSSProperties}
        role="application"
        aria-label={armed ? t('jewels.aimAria', { booster: t(`jewels.booster.${armed}`) }) : t('jewels.boardAria')}
        onPointerDown={(e) => {
          const p = cellAt(e);
          if (!p) return;
          gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cell: p, done: false };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.done || g.id !== e.pointerId || armed) return;
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
        {use3D && <Board3D rows={rows} cols={cols} width={size} height={height} pieces={pieces} effects={effects} selected={selected} moveMs={moveMs} idle={glints} onReady={setReady3D} />}
        {ready3D && (
          // The 3D layer draws the hint itself; these invisible markers keep the hinted cells findable.
          <div className="jw-layer" aria-hidden>
            {pieces
              .filter((p) => p.phase === 'hint')
              .map((p) => (
                <span key={p.id} className="jw-hint-at" style={{ transform: `translate3d(${p.c * 100}%, ${p.r * 100}%, 0)` }} />
              ))}
          </div>
        )}
        <div className="jw-layer" hidden={ready3D}>
          {!ready3D && pieces.map((p) => (
            <JewelView key={p.id} kind={p.kind} special={p.special} hp={p.hp} r={p.r} c={p.c} phase={p.phase} selected={!!selected && selected.r === p.r && selected.c === p.c} glint={glints && p.id % 7 === 0} dropFrom={p.dropFrom} dropMs={moveMs} />
          ))}
        </div>
        <div className="jw-fx" aria-hidden>
          {!ready3D &&
            effects.map((f) =>
              f.type === 'boltRow' || f.type === 'boltCol' ? (
                <Bolt key={f.id} e={f} cell={cell} rows={rows} cols={cols} />
              ) : f.type === 'hammer' ? (
                <span key={f.id} className="jw-hammer" style={{ left: (f.c + 0.5) * cell, top: (f.r + 0.5) * cell, width: cell * 1.6, height: cell * 1.6 }} />
              ) : (
                <span
                  key={f.id}
                  className={`jw-wave ${f.type === 'divine' ? 'is-divine' : ''}`}
                  style={{ left: (f.c + 0.5) * cell, top: (f.r + 0.5) * cell, width: cell * (f.size ?? 1.5) * 2, height: cell * (f.size ?? 1.5) * 2 }}
                />
              )
            )}
          {pops.map((p) => (
            <span key={p.id} className={`jw-pop${p.big ? ' is-big' : ''}`} style={{ left: (p.c + 0.5) * cell, top: (p.r + 0.5) * cell }}>
              +{p.points.toLocaleString()}
            </span>
          ))}
          {combo && combo.n >= 2 && (
            <span key={combo.id} className="jw-combo">
              {t('jewels.cascade', { n: combo.n })}
            </span>
          )}
        </div>
        <canvas ref={canvas} className="jw-sparks" aria-hidden />
      </div>
    </div>
  );
}
