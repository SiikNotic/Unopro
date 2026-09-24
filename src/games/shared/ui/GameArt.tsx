import { memo } from 'react';
import { DominoTile } from '@/games/domino/ui/DominoTile';
import { Ball } from '@/games/bingo/ui/BingoParts';
import '@/games/domino/ui/domino.css';
import '@/games/bingo/ui/bingo.css';

/** Domino artwork: three real tiles leaning into each other, one lying flat in front. */
export const DominoArt = memo(function DominoArt({ size }: { size: number }) {
  return (
    <div className="relative" style={{ width: size * 3.4, height: size * 2.5 }} aria-hidden>
      <DominoTile top={6} bottom={6} size={size} seed="art66" className="absolute" style={{ left: size * 0.5, top: size * 0.05, transform: 'rotate(-14deg)' }} />
      <DominoTile top={5} bottom={3} size={size} seed="art53" className="absolute" style={{ left: size * 1.35, top: 0, transform: 'rotate(4deg)' }} />
      <DominoTile top={4} bottom={1} size={size} seed="art41" className="absolute" style={{ left: size * 2.2, top: size * 0.1, transform: 'rotate(18deg)' }} />
      <DominoTile top={2} bottom={6} size={size} seed="art26" rotate={-90} className="absolute" style={{ left: size * 1.3, top: size * 1.35 }} />
    </div>
  );
});

/** Bingo artwork: three balls bouncing over a card corner. */
export const BingoArt = memo(function BingoArt({ size }: { size: number }) {
  return (
    <div className="bg relative !min-h-0" style={{ width: size * 3.4, height: size * 2.5 }} aria-hidden>
      <div className="absolute bg-card" style={{ left: size * 0.35, top: size * 0.95, width: size * 2.6, padding: size * 0.1, transform: 'rotate(-6deg)' }}>
        <div className="bg-grid" style={{ gap: size * 0.05 }}>
          {'BINGO'.split('').map((l, c) => (
            <span key={l} className={`bg-head bg-col-${c}`} style={{ height: size * 0.36, fontSize: size * 0.24, borderRadius: size * 0.08 }}>
              {l}
            </span>
          ))}
        </div>
      </div>
      <span className="absolute hub-bounce" style={{ left: size * 0.1, top: size * 0.15, animationDelay: '0s' }}>
        <Ball n={7} size={Math.round(size * 0.95)} />
      </span>
      <span className="absolute hub-bounce" style={{ left: size * 1.25, top: 0, animationDelay: '-0.6s' }}>
        <Ball n={42} size={Math.round(size * 0.95)} />
      </span>
      <span className="absolute hub-bounce" style={{ left: size * 2.35, top: size * 0.25, animationDelay: '-1.2s' }}>
        <Ball n={68} size={Math.round(size * 0.95)} />
      </span>
    </div>
  );
});
