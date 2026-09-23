import type { GameState } from '@/game/engine';
import { useI18n } from '@/i18n';
import { GameCard } from './GameCard';
import { hashTilt } from './cardTheme';

interface TableCenterProps {
  state: GameState;
  pileWidth: number;
  canDraw: boolean;
  onDraw: () => void;
  register: (key: string) => (el: HTMLElement | null) => void;
}

const GLOW: Record<string, string> = {
  RED: 'rgba(224, 49, 75, 0.75)',
  YELLOW: 'rgba(242, 173, 31, 0.75)',
  GREEN: 'rgba(21, 163, 106, 0.75)',
  BLUE: 'rgba(37, 99, 235, 0.8)',
};

/** Draw pile and discard pile inside the stitched play zone. The discard shows the engine's real cards. */
export function TableCenter({ state, pileWidth, canDraw, onDraw, register }: TableCenterProps) {
  const { t } = useI18n();
  const underneath = state.discardPile.slice(-4, -1);
  const top = state.discardPile[state.discardPile.length - 1];
  const glow = state.currentColor ? GLOW[state.currentColor] : 'rgba(255,255,255,0.3)';
  const cw = { '--cw': `${pileWidth}px` } as React.CSSProperties;
  const clockwise = state.direction === 'CLOCKWISE';

  return (
    <div className="relative flex items-center justify-center" style={{ gap: pileWidth * 0.5, padding: `${pileWidth * 0.22}px ${pileWidth * 0.34}px` }}>
      {/* Direction: two arcs orbiting the piles */}
      <svg
        className="absolute inset-0 m-auto pointer-events-none text-white/20 transition-transform duration-500"
        style={{ width: '100%', height: '100%', transform: clockwise ? 'scaleX(1)' : 'scaleX(-1)' }}
        viewBox="0 0 200 120"
        preserveAspectRatio="none"
        aria-label={t(`table.direction.${state.direction}`)}
        role="img"
      >
        <path d="M30 22 Q100 -6 170 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d="M170 98 Q100 126 30 98" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d="M162 14 L172 23 L160 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d="M38 106 L28 97 L40 92" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Draw pile */}
      <button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        className={`relative rounded-[10%] transition-transform duration-200 ${canDraw ? 'hover:-translate-y-1 active:translate-y-0 cursor-pointer' : 'cursor-default'}`}
        aria-label={canDraw ? `${t('table.draw')} (${t('table.deck')}: ${state.deck.length})` : `${t('table.deck')}: ${state.deck.length}`}
        style={cw}
      >
        <div className={state.deck.length > 0 ? 'draw-stack' : 'opacity-40'}>
          <div ref={register('draw-pile')}>
            <GameCard faceDown />
          </div>
        </div>
        {canDraw && (
          <span className="absolute -inset-1.5 rounded-[14%] border-2 border-[#f3ecdc]/80 pointer-events-none animate-pop" />
        )}
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#f3ecdc] text-ink-950 px-2 text-[11px] font-extrabold tabular-nums shadow">
          {state.deck.length}
        </span>
      </button>

      {/* Discard pile */}
      <div className="relative" style={{ ...cw, width: pileWidth, height: pileWidth * 1.5 }} aria-label={t('table.discard')}>
        <div
          key={state.currentColor ?? 'none'}
          className="absolute -inset-[30%] rounded-full pointer-events-none animate-pop opacity-70"
          style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }}
        />
        {underneath.map((card, i) => (
          <GameCard key={card.id} card={card} className="!absolute inset-0" style={{ transform: `rotate(${hashTilt(card.id, 30)}deg) translate(${(i - 1) * 2}px, ${i}px)` }} />
        ))}
        {top && (
          <div key={top.id} ref={register('discard-top')} className="absolute inset-0">
            <GameCard card={top} style={{ transform: `rotate(${hashTilt(top.id, 10)}deg)` }} />
          </div>
        )}
      </div>
    </div>
  );
}
