// Where each tile of the line sits on the table. Pure geometry (unit: one tile's short side), no DOM.
//
// The first tile sits in the centre. The line grows to the right and to the left; when an arm reaches the
// table's edge it turns the corner (one tile hanging down on the right, up on the left) and carries on in
// the opposite direction, like a real snake of tiles. Doubles lie across the line.
import type { PlacedTile } from '../engine/types';

export interface TileBox {
  seq: number;
  /** Centre, in short-side units, relative to the lead tile's centre. */
  x: number;
  y: number;
  /** Degrees for DominoTile (0 = upright). */
  rotate: number;
  /** Pips to draw on the upright tile's top and bottom halves. */
  top: number;
  bottom: number;
  /** Width/height of the laid tile (2×1 or 1×2). */
  w: number;
  h: number;
}

type Dir = 'right' | 'left' | 'down' | 'up';
const VEC: Record<Dir, [number, number]> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
/** Rotation that makes the upright tile's top→bottom axis point along the direction of travel. */
const ROT: Record<Dir, number> = { down: 0, left: 90, up: 180, right: -90 };

/**
 * @param halfWidth how far (in short sides) a horizontal run may reach from the centre before turning.
 */
export function layoutLine(line: readonly PlacedTile[], halfWidth: number): TileBox[] {
  if (line.length === 0) return [];
  const lead = line.reduce((a, b) => (b.seq < a.seq ? b : a));
  const leadIndex = line.indexOf(lead);
  const out: TileBox[] = [];
  const leadDouble = lead.left === lead.right;
  out.push(leadDouble ? { seq: lead.seq, x: 0, y: 0, rotate: 0, top: lead.left, bottom: lead.right, w: 1, h: 2 } : { seq: lead.seq, x: 0, y: 0, rotate: -90, top: lead.left, bottom: lead.right, w: 2, h: 1 });
  const leadExtent = leadDouble ? 0.5 : 1;

  // Walk one arm outward. `incoming` is the pip that touches the previous tile.
  const arm = (tiles: PlacedTile[], side: 'right' | 'left') => {
    const turnDir: Dir = side === 'right' ? 'down' : 'up';
    const turnSign = turnDir === 'down' ? 1 : -1;
    let dir: Dir = side;
    /** Direction of the row we were on before hanging a tile round the corner. */
    let rowDir: Dir = side;
    let cx = side === 'right' ? leadExtent : -leadExtent;
    let cy = 0;
    /** Half the size, across the line, of the tile we just laid (doubles stick out further). */
    let lastHalfAcross = leadDouble ? 1 : 0.5;
    let last: TileBox = out[0];
    for (const t of tiles) {
      const incoming = side === 'right' ? t.left : t.right;
      const outgoing = side === 'right' ? t.right : t.left;
      const double = incoming === outgoing;
      const len = double ? 1 : 2;
      const horizontal = dir === 'left' || dir === 'right';
      // A double never hangs round a corner (it is only one unit wide, so it stays in the row); the
      // next tile turns instead. That keeps every row two units from the next.
      if (horizontal && !double && Math.abs(cx + VEC[dir][0] * len) > halfWidth) {
        // Hang this tile round the corner, flush with the outer end of the last one.
        rowDir = dir;
        cx += dir === 'right' ? -0.5 : 0.5;
        cy += turnSign * lastHalfAcross;
        dir = turnDir;
      } else if (!horizontal) {
        // After the hanging tile, run back the other way, level with its far half.
        const back: Dir = rowDir === 'right' ? 'left' : 'right';
        cx = last.x + VEC[back][0] * (last.w / 2);
        cy = last.y + turnSign * (last.h / 2 - 0.5);
        dir = back;
      }
      const [dx, dy] = VEC[dir];
      const along = dir === 'left' || dir === 'right';
      const rotate = double ? (along ? 0 : 90) : ROT[dir];
      const w = along ? (double ? 1 : 2) : double ? 2 : 1;
      const h = along ? (double ? 2 : 1) : double ? 1 : 2;
      last = { seq: t.seq, x: cx + (dx * len) / 2, y: cy + (dy * len) / 2, rotate, top: incoming, bottom: outgoing, w, h };
      out.push(last);
      cx += dx * len;
      cy += dy * len;
      lastHalfAcross = along ? h / 2 : w / 2;
    }
  };
  arm(line.slice(leadIndex + 1), 'right');
  arm(line.slice(0, leadIndex).reverse(), 'left');
  return out;
}

export function bounds(boxes: readonly TileBox[]) {
  if (boxes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...boxes.map((b) => b.x - b.w / 2)),
    maxX: Math.max(...boxes.map((b) => b.x + b.w / 2)),
    minY: Math.min(...boxes.map((b) => b.y - b.h / 2)),
    maxY: Math.max(...boxes.map((b) => b.y + b.h / 2)),
  };
}
