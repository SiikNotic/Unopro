import { useRef } from 'react';
import type { Card } from '@/game/engine';
import { useElementWidth } from '@/hooks/useViewport';
import { GameCard } from './GameCard';
import { useCardName } from './useCardName';
import { computeHandLayout } from './handLayout';

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
 * Fanned, overlapping hand that always fits the screen: as the hand grows the overlap increases and,
 * if needed, cards shrink slightly. One tap plays a legal card (the parent validates through the engine).
 */
export function PlayerHand({ cards, cardWidth, playableIds, myMove, highlightId, onCardTap, register }: PlayerHandProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measured = useElementWidth(containerRef);
  const cardName = useCardName();
  const n = cards.length;
  // Leave room for the rotated edge cards so nothing sticks out of the viewport.
  const edge = Math.round(cardWidth * 0.34);
  const layout = computeHandLayout(n, (measured || cardWidth * 4) - edge * 2, cardWidth);
  const cw = layout.cardWidth;
  const cardHeight = cw * 1.5;

  return (
    <div ref={containerRef} className="relative w-full overflow-visible" style={{ paddingTop: cardHeight * 0.18, paddingBottom: cardHeight * 0.14 }}>
      <div className="relative mx-auto" style={{ width: layout.width, height: cardHeight + 4 }}>
        {cards.map((card, i) => {
          const fan = `translateY(${layout.drops[i]}px) rotate(${layout.angles[i]}deg)`;
          const playable = myMove && playableIds.has(card.id);
          const classes = [
            'hand-card block origin-bottom',
            playable ? 'hand-card-playable cursor-pointer' : 'cursor-default',
            myMove && !playable ? 'hand-card-dim' : '',
            card.id === highlightId ? 'hand-card-drawn' : '',
          ].join(' ');
          return (
            <div key={card.id} ref={register(`card:${card.id}`)} className="absolute bottom-0" style={{ left: i * layout.step, zIndex: i }}>
              <button
                type="button"
                className={classes}
                aria-label={cardName(card)}
                aria-disabled={!playable}
                onClick={(e) => onCardTap(card, e.currentTarget)}
                style={{ '--fan': fan, transform: playable ? `${fan} translateY(-5%)` : fan } as React.CSSProperties}
              >
                <GameCard card={card} style={{ '--cw': `${cw}px` } as React.CSSProperties} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
