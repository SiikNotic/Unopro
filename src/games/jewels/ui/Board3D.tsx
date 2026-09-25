// The WebGL layer of the board: the 3D pieces. three.js is loaded on demand (its own chunk), and until it is
// ready, or on a device without WebGL, the board keeps drawing the DOM jewels, so nothing waits on it.
import { useEffect, useRef } from 'react';
import type { Pos } from '../engine';
import { isLiteDevice } from '@/components/scene/particles';
import type { GemScene } from './three/GemScene';
import type { VPiece } from './useJewelGame';

interface Board3DProps {
  rows: number;
  cols: number;
  width: number;
  height: number;
  pieces: VPiece[];
  selected: Pos | null;
  moveMs: number;
  /** Idle shimmer (off with reduced motion / animations off). */
  idle: boolean;
  onReady: (ready: boolean) => void;
}

export function Board3D({ rows, cols, width, height, pieces, selected, moveMs, idle, onReady }: Board3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<GemScene | null>(null);
  const latest = useRef({ pieces, selected, moveMs, idle, width, height });
  latest.current = { pieces, selected, moveMs, idle, width, height };

  useEffect(() => {
    let alive = true;
    import('./three/GemScene')
      .then(({ GemScene }) => {
        if (!alive || !canvas.current) return;
        const s = new GemScene(canvas.current, rows, cols, { idle: latest.current.idle, lite: isLiteDevice() });
        scene.current = s;
        s.resize(latest.current.width, latest.current.height);
        // The pieces already on the board appear in place (no drop).
        s.sync(
          latest.current.pieces.map((p) => ({ ...p, dropFrom: undefined })),
          latest.current.selected,
          0
        );
        onReady(true);
      })
      .catch(() => onReady(false));
    return () => {
      alive = false;
      scene.current?.dispose();
      scene.current = null;
    };
    // The scene lives as long as the board's shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols]);

  useEffect(() => scene.current?.resize(width, height), [width, height]);
  useEffect(() => scene.current?.setIdle(idle), [idle]);
  useEffect(() => scene.current?.sync(pieces, selected, moveMs), [pieces, selected, moveMs]);

  return <canvas ref={canvas} className="jw-3d" aria-hidden />;
}
