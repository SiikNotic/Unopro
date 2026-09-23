import { RotateCw } from 'lucide-react';
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

const COLOR_GLOW: Record<string, string> = {
  RED: 'rgba(255, 70, 90, 0.75)',
  YELLOW: 'rgba(255, 200, 60, 0.75)',
  GREEN: 'rgba(40, 220, 150, 0.7)',
  BLUE: 'rgba(70, 150, 255, 0.75)',
};

/** Draw pile + discard pile on the felt. The discard shows the engine's real top cards. */
export function TableCenter({ state, pileWidth, canDraw, onDraw, register }: TableCenterProps) {
  const { t } = useI18n();
  const underneath = state.discardPile.slice(-3, -1);
  const top = state.discardPile[state.discardPile.length - 1];
  const glow = state.currentColor ? COLOR_GLOW[state.currentColor] : 'rgba(255,255,255,0.25)';
  const cw = { '--cw': `${pileWidth}px` } as React.CSSProperties;

  return (
    <div className="relative flex items-center justify-center" style={{ gap: pileWidth * 0.45 }}>
      {/* Direction ring */}
      <RotateCw
        aria-label={t(`table.direction.${state.direction}`)}
        className="absolute text-white/15 pointer-events-none transition-transform duration-500"
        style={{
          width: pileWidth * 3.6,
          height: pileWidth * 3.6,
          transform: state.direction === 'CLOCKWISE' ? 'scaleX(1)' : 'scaleX(-1)',
        }}
        strokeWidth={0.6}
      />

      {/* Draw pile */}
      <button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        className={`relative rounded-[10%] transition-transform duration-200 ${canDraw ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-default'}`}
        aria-label={`${t('table.deck')}: ${state.deck.length}`}
        style={cw}
      >
        <div className={state.deck.length > 0 ? 'draw-stack rounded-[inherit]' : 'opacity-30'}>
          <div ref={register('draw-pile')}>
            <GameCard faceDown />
          </div>
        </div>
        {canDraw && <span className="absolute inset-0 rounded-[11%] ring-2 ring-brand-300/80 animate-pop pointer-events-none" />}
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink-950/90 border border-white/15 px-2 text-[11px] font-bold">
          {state.deck.length}
        </span>
      </button>

      {/* Discard pile */}
      <div className="relative" style={{ ...cw, width: pileWidth, height: pileWidth * 1.5 }} aria-label={t('table.discard')}>
        <div
          key={state.currentColor ?? 'none'}
          className="absolute -inset-[35%] rounded-full animate-pop pointer-events-none"
          style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }}
        />
        {underneath.map((card) => (
          <GameCard key={card.id} card={card} className="!absolute inset-0" style={{ transform: `rotate(${hashTilt(card.id, 24)}deg)` }} />
        ))}
        {top && (
          <div key={top.id} ref={register('discard-top')} className="absolute inset-0">
            <GameCard card={top} style={{ transform: `rotate(${hashTilt(top.id, 12)}deg)` }} />
          </div>
        )}
      </div>
    </div>
  );
}
