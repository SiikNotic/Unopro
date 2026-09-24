import { memo } from 'react';
import type { PlayingCard } from '@/casino/cards';
import { isRed } from '@/casino/cards';
import { GameCard } from '@/components/table/GameCard';
import { useI18n } from '@/i18n';
import { FrenchSuit } from './frenchSuits';

interface PlayingCardViewProps {
  card: PlayingCard;
  faceDown?: boolean;
  width: number;
  className?: string;
  style?: React.CSSProperties;
}

/** French-suited card on the same cream stock as Carta's cards; the back is Carta's own. */
export const PlayingCardView = memo(function PlayingCardView({ card, faceDown, width, className = '', style }: PlayingCardViewProps) {
  const { t } = useI18n();
  const sizing = { '--cw': `${width}px`, ...style } as React.CSSProperties;
  if (faceDown) return <GameCard faceDown className={className} style={sizing} />;
  const court = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const label = t('casino.cardName', { rank: t(`casino.ranks.${card.rank}`), suit: t(`casino.suits.${card.suit}`) });
  return (
    <div className={`pc-card ${className}`} style={sizing} role="img" aria-label={label}>
      <div className={`fc-face ${isRed(card.suit) ? 'fc-red' : 'fc-black'}`}>
        <span className="fc-index fc-index-tl">
          {card.rank}
          <FrenchSuit suit={card.suit} />
        </span>
        <span className="fc-center">
          {court ? (
            <span className="fc-court">
              <FrenchSuit suit={card.suit} />
              {card.rank}
              <FrenchSuit suit={card.suit} />
            </span>
          ) : (
            <FrenchSuit suit={card.suit} className="fc-pip" />
          )}
        </span>
        <span className="fc-index fc-index-br">
          {card.rank}
          <FrenchSuit suit={card.suit} />
        </span>
      </div>
    </div>
  );
});
