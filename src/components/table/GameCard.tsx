import { memo } from 'react';
import { Ban, Repeat2 } from 'lucide-react';
import type { Card, CardColor } from '@/game/engine';
import { useI18n } from '@/i18n';
import { COLOR_THEME } from './cardTheme';
import { useCardName } from './useCardName';

interface GameCardProps {
  card?: Card;
  /** Render the back instead of the face (also used when `card` is omitted). */
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function Glyph({ card, size }: { card: Card; size: 'big' | 'small' }) {
  switch (card.type) {
    case 'NUMBER':
      return <span className={card.value === 6 || card.value === 9 ? 'underline decoration-2 underline-offset-2' : ''}>{card.value}</span>;
    case 'SKIP':
      return <Ban className={size === 'big' ? 'pc-icon-big' : 'pc-icon-small'} strokeWidth={2.75} />;
    case 'REVERSE':
      return <Repeat2 className={size === 'big' ? 'pc-icon-big' : 'pc-icon-small'} strokeWidth={2.75} />;
    case 'DRAW_TWO':
      return <span>+2</span>;
    case 'WILD':
      return size === 'big' ? <span className="pc-wheel" /> : <span className="pc-wheel pc-wheel-small" />;
    case 'WILD_DRAW_FOUR':
      return <span>+4</span>;
  }
}

/** Original card design: cream card stock, jewel-tone face, central gem and corner indices. */
export const GameCard = memo(function GameCard({ card, faceDown, className = '', style }: GameCardProps) {
  const cardName = useCardName();
  const { t } = useI18n();

  if (!card || faceDown) {
    return (
      <div className={`pc-card ${className}`} style={style} role="img" aria-label={t('cards.back')}>
        <div className="pc-back">
          <span className="pc-back-emblem" />
        </div>
      </div>
    );
  }

  const isWildCard = card.color === 'WILD';
  const theme = isWildCard ? null : COLOR_THEME[card.color as CardColor];
  const Suit = theme?.Icon;

  return (
    <div className={`pc-card ${className}`} style={style} role="img" aria-label={cardName(card)}>
      <div className={`pc-face ${theme?.className ?? 'pc-wild'}`}>
        <div className="pc-corner pc-corner-tl">
          <Glyph card={card} size="small" />
          {Suit && <Suit className="pc-suit" strokeWidth={2.5} />}
        </div>
        <div className={`pc-gem ${card.type === 'WILD_DRAW_FOUR' ? 'pc-gem-wild4' : ''}`}>
          <div className="pc-gem-inner">
            <Glyph card={card} size="big" />
          </div>
        </div>
        <div className="pc-corner pc-corner-br">
          <Glyph card={card} size="small" />
          {Suit && <Suit className="pc-suit" strokeWidth={2.5} />}
        </div>
      </div>
    </div>
  );
});
