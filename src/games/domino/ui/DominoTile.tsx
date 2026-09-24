import { memo } from 'react';
import type { CSSProperties } from 'react';
import { hashSeed } from '@/games/shared/rng';

/** 3×3 pip grid slots (0 = top-left … 8 = bottom-right) for each value. */
const PIPS: number[][] = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

function Half({ value }: { value: number }) {
  return (
    <span className="dt-half">
      {PIPS[value].map((slot) => (
        <i key={slot} className="dt-pip" style={{ gridArea: `${Math.floor(slot / 3) + 1} / ${(slot % 3) + 1}` }} />
      ))}
    </span>
  );
}

export interface DominoTileProps {
  /** Pips on the top half and bottom half of the upright tile. */
  top?: number;
  bottom?: number;
  /** Seen from behind (opponents' hands, the boneyard). */
  faceDown?: boolean;
  /** Short side in px; the tile is twice as long. */
  size: number;
  /** Degrees, applied around the centre (0 = upright, -90 = lying left→right). */
  rotate?: number;
  /** Used to vary the ivory slightly from tile to tile. */
  seed?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A physical tile: bevelled ivory body with a visible edge, engraved pips, a brass centre pin, and tiny
 * per-tile variation of tone and grain so a table full of tiles doesn't look stamped out.
 */
export const DominoTile = memo(function DominoTile({ top = 0, bottom = 0, faceDown = false, size, rotate = 0, seed = '', className = '', style }: DominoTileProps) {
  const h = hashSeed(seed || `${top}${bottom}`);
  const vars = {
    '--t': `${size}px`,
    '--tone': ((h % 1000) / 1000 - 0.5).toFixed(3),
    '--grain': `${(h >>> 10) % 90}deg`,
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
    ...style,
  } as CSSProperties;
  return (
    <span className={`dt ${faceDown ? 'dt-back' : ''} ${className}`} style={vars} aria-hidden>
      {!faceDown && (
        <>
          <Half value={top} />
          <span className="dt-bar">
            <i />
          </span>
          <Half value={bottom} />
        </>
      )}
    </span>
  );
});
