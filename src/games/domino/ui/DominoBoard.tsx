import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { End, PlacedTile, Tile } from '../engine/types';
import { placeAt } from '../engine/rules';
import { DominoTile } from './DominoTile';
import { bounds, layoutLine } from './layout';
import type { TileBox } from './layout';

export interface GhostTarget {
  end: End;
  label: string;
}

interface BoardProps {
  line: PlacedTile[];
  /** Selected tile and the ends it may go to (shown as dashed outlines you can tap). */
  ghostTile: Tile | null;
  ghosts: GhostTarget[];
  onGhost: (end: End) => void;
  /** Where the newest tile flew in from (a hand slot or a seat), in viewport coordinates. */
  flightFrom: () => DOMRect | null;
  animate: boolean;
  emptyLabel: string;
  children?: React.ReactNode;
}

/** How big a tile is on this table, and how wide a run may be before it turns the corner. */
function metrics(w: number) {
  const unit = Math.max(16, Math.min(w >= 700 ? 44 : 34, w / 14));
  const halfWidth = Math.max(4, Math.floor(w / unit / 2 - 0.6));
  return { unit, halfWidth };
}

export function DominoBoard({ line, ghostTile, ghosts, onGhost, flightFrom, animate, emptyLabel, children }: BoardProps) {
  const cloth = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = cloth.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { unit, halfWidth } = metrics(size.w);
  const boxes = useMemo(() => layoutLine(line, halfWidth), [line, halfWidth]);
  const ghostBoxes = useMemo(() => {
    if (!ghostTile || line.length === 0) return [];
    return ghosts.map((g) => {
      const placed = placeAt(ghostTile, g.end, line, 'ghost', line.length);
      const next = g.end === 'right' ? [...line, placed] : [placed, ...line];
      return { ...g, box: layoutLine(next, halfWidth).find((b) => b.seq === placed.seq)! };
    });
  }, [ghostTile, ghosts, line, halfWidth]);

  // Fit the whole line (and any ghost) inside the cloth, centred.
  const all: TileBox[] = [...boxes, ...ghostBoxes.map((g) => g.box)];
  const b = bounds(all);
  const pad = 14;
  const scale = all.length ? Math.min(1, (size.w - pad * 2) / ((b.maxX - b.minX) * unit), (size.h - pad * 2) / ((b.maxY - b.minY) * unit)) : 1;
  const u = unit * scale;
  const cx = ((b.minX + b.maxX) / 2) * u;
  const cy = ((b.minY + b.maxY) / 2) * u;

  // The newest tile flies in from where it was played, lands with a little weight, and settles.
  const slots = useRef(new Map<number, HTMLDivElement>());
  const latest = line.reduce((m, t) => Math.max(m, t.seq), -1);
  const shown = useRef(latest);
  useLayoutEffect(() => {
    if (latest <= shown.current) {
      shown.current = latest;
      return;
    }
    shown.current = latest;
    const el = slots.current.get(latest);
    const from = flightFrom();
    if (!el || !from || !animate) return;
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1.18)`, filter: 'drop-shadow(0 22px 16px rgba(0,0,0,0.45))' },
        { transform: 'translate(0, 0) scale(1.06)', filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.35))', offset: 0.78 },
        { transform: 'translate(0, 0) scale(1)', filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' },
      ],
      { duration: 440, easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)' }
    );
  }, [latest, flightFrom, animate]);

  return (
    <div className="dm-cloth" ref={cloth}>
      {line.length === 0 && <div className="dm-empty">{emptyLabel}</div>}
      <div className="dm-line" style={{ transform: `translate(${-cx}px, ${-cy}px)` }}>
        {boxes.map((box) => (
          <div
            key={box.seq}
            ref={(el) => {
              if (el) slots.current.set(box.seq, el);
              else slots.current.delete(box.seq);
            }}
            className="dm-slot"
            style={{ left: box.x * u - (box.w * u) / 2, top: box.y * u - (box.h * u) / 2, width: box.w * u, height: box.h * u }}
          >
            <DominoTile top={box.top} bottom={box.bottom} size={u} rotate={box.rotate} seed={`${box.top}${box.bottom}${box.seq}`} />
          </div>
        ))}
        {ghostBoxes.map((g) => (
          <button
            key={g.end}
            type="button"
            className="dm-ghost"
            aria-label={g.label}
            onClick={() => onGhost(g.end)}
            style={{ left: g.box.x * u - (g.box.w * u) / 2 - 2, top: g.box.y * u - (g.box.h * u) / 2 - 2, width: g.box.w * u + 4, height: g.box.h * u + 4 }}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
