import { useRef } from 'react';
import type { Card } from '@/game/engine';
import { useElementWidth } from '@/hooks/useViewport';
import { GameCard } from './GameCard';
import { useCardName } from './useCardName';

interface PlayerHandProps {
  cards: Card[];
  cardWidth: number;
  playableIds: Set<string>;
  interactive: boolean;
  selectedId: string | null;
  highlightId?: string | null;
  onCardClick: (card: Card, el: HTMLElement) => void;
  register: (key: string) => (el: HTMLElement | null) => void;
}

/** Overlapping, slightly fanned hand. Scrolls horizontally inside itself when it cannot fit. */
export function PlayerHand({ cards, cardWidth, playableIds, interactive, selectedId, highlightId, onCardClick, register }: PlayerHandProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const available = useElementWidth(containerRef) - 16;
  const cardName = useCardName();
  const n = cards.length;
  const cardHeight = cardWidth * 1.5;

  const maxStep = cardWidth * 0.7;
  const minStep = cardWidth * 0.5;
  const fitStep = n > 1 ? (available - cardWidth) / (n - 1) : 0;
  const step = n > 1 ? Math.max(minStep, Math.min(maxStep, fitStep)) : 0;
  const totalWidth = cardWidth + step * Math.max(0, n - 1);
  const spread = Math.min(4, 36 / Math.max(n, 1));

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto overflow-y-hidden px-2"
      style={{ paddingTop: cardHeight * 0.22, paddingBottom: cardHeight * 0.18, scrollbarWidth: 'thin' }}
    >
      <div className="relative mx-auto" style={{ width: totalWidth, height: cardHeight + 6 }}>
        {cards.map((card, i) => {
          const offset = i - (n - 1) / 2;
          const fan = `rotate(${offset * spread}deg) translateY(${offset * offset * spread * 0.25}px)`;
          const selected = card.id === selectedId;
          const playable = playableIds.has(card.id);
          const classes = [
            'hand-card block origin-bottom',
            interactive ? 'hand-card-interactive cursor-pointer' : 'cursor-default',
            selected ? 'hand-card-selected' : '',
            interactive && !playable ? 'hand-card-disabled' : '',
          ].join(' ');
          return (
            <div
              key={card.id}
              ref={register(`card:${card.id}`)}
              className="absolute bottom-0"
              style={{ left: i * step, zIndex: selected ? 100 : i }}
            >
              <button
                type="button"
                className={classes}
                aria-pressed={selected}
                aria-label={cardName(card)}
                aria-disabled={!interactive || !playable}
                onClick={(e) => onCardClick(card, e.currentTarget)}
                style={
                  {
                    '--fan': fan,
                    transform: selected ? `${fan} translateY(-18%) scale(1.07)` : fan,
                  } as React.CSSProperties
                }
              >
                <GameCard
                  card={card}
                  style={{ '--cw': `${cardWidth}px` } as React.CSSProperties}
                  className={card.id === highlightId && !selected ? 'ring-2 ring-gold-400 ring-offset-2 ring-offset-transparent' : ''}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
