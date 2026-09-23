import { useRef } from 'react';
import type { Card } from '@/game/engine';
import { useElementWidth } from '@/hooks/useViewport';
import { GameCard } from './GameCard';
import { useCardName } from './useCardName';

interface PlayerHandProps {
  cards: Card[];
  cardWidth: number;
  playableIds: Set<string>;
  /** False while it is not the player's move (cards are shown but not dimmed as "illegal"). */
  myMove: boolean;
  highlightId?: string | null;
  onCardTap: (card: Card, el: HTMLElement) => void;
  register: (key: string) => (el: HTMLElement | null) => void;
}

/**
 * Fanned, overlapping hand. One tap plays a legal card (the parent validates through the engine).
 * Scrolls horizontally inside itself when it cannot fit, so the page never does.
 */
export function PlayerHand({ cards, cardWidth, playableIds, myMove, highlightId, onCardTap, register }: PlayerHandProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const available = useElementWidth(containerRef) - 24;
  const cardName = useCardName();
  const n = cards.length;
  const cardHeight = cardWidth * 1.5;

  const maxStep = cardWidth * 0.68;
  const minStep = cardWidth * 0.5;
  const fitStep = n > 1 ? (available - cardWidth) / (n - 1) : 0;
  const step = n > 1 ? Math.max(minStep, Math.min(maxStep, fitStep)) : 0;
  const totalWidth = cardWidth + step * Math.max(0, n - 1);
  const spread = Math.min(3.2, 30 / Math.max(n, 1));

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto overflow-y-hidden px-3"
      style={{ paddingTop: cardHeight * 0.2, paddingBottom: cardHeight * 0.22, scrollbarWidth: 'thin' }}
    >
      <div className="relative mx-auto" style={{ width: totalWidth, height: cardHeight + 4 }}>
        {cards.map((card, i) => {
          const offset = i - (n - 1) / 2;
          const fan = `rotate(${offset * spread}deg) translateY(${offset * offset * spread * 0.22}px)`;
          const playable = myMove && playableIds.has(card.id);
          const classes = [
            'hand-card block origin-bottom',
            playable ? 'hand-card-playable cursor-pointer' : 'cursor-default',
            myMove && !playable ? 'hand-card-dim' : '',
            card.id === highlightId ? 'hand-card-drawn' : '',
          ].join(' ');
          return (
            <div key={card.id} ref={register(`card:${card.id}`)} className="absolute bottom-0" style={{ left: i * step, zIndex: i }}>
              <button
                type="button"
                className={classes}
                aria-label={cardName(card)}
                aria-disabled={!playable}
                onClick={(e) => onCardTap(card, e.currentTarget)}
                style={{ '--fan': fan, transform: playable ? `${fan} translateY(-4%)` : fan } as React.CSSProperties}
              >
                <GameCard card={card} style={{ '--cw': `${cardWidth}px` } as React.CSSProperties} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
