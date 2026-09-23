import { memo } from 'react';
import type { Card, CardColor } from '@/game/engine';
import { COLORS } from '@/game/engine';
import { useI18n } from '@/i18n';
import { COLOR_THEME, suitPattern } from './cardTheme';
import { ReverseGlyph, SkipGlyph, SuitIcon, WildWheel } from './cardArt';
import { useCardName } from './useCardName';

interface GameCardProps {
  card?: Card;
  /** Render the back instead of the face (also used when `card` is omitted). */
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Big central symbol. */
function Center({ card }: { card: Card }) {
  switch (card.type) {
    case 'NUMBER':
      return <span className={`pc-numeral ${card.value === 6 || card.value === 9 ? 'pc-underline' : ''}`}>{card.value}</span>;
    case 'SKIP':
      return <SkipGlyph className="pc-glyph" />;
    case 'REVERSE':
      return <ReverseGlyph className="pc-glyph" />;
    case 'DRAW_TWO':
      return <span className="pc-numeral pc-numeral-plus">+2</span>;
    case 'WILD':
      return <WildWheel className="pc-wheel" />;
    case 'WILD_DRAW_FOUR':
      return (
        <span className="pc-wild4">
          <WildWheel className="pc-wheel pc-wheel-back" withSuits={false} />
          <span className="pc-numeral pc-numeral-plus">+4</span>
        </span>
      );
  }
}

/** Corner index: symbol + suit, readable when cards overlap in a fanned hand. */
function Index({ card, color }: { card: Card; color: CardColor | null }) {
  let symbol: React.ReactNode;
  switch (card.type) {
    case 'NUMBER':
      symbol = <span className={card.value === 6 || card.value === 9 ? 'pc-underline' : ''}>{card.value}</span>;
      break;
    case 'SKIP':
      symbol = <SkipGlyph className="pc-index-glyph" />;
      break;
    case 'REVERSE':
      symbol = <ReverseGlyph className="pc-index-glyph" />;
      break;
    case 'DRAW_TWO':
      symbol = <span>+2</span>;
      break;
    case 'WILD':
      symbol = <WildWheel className="pc-index-glyph" withSuits={false} />;
      break;
    case 'WILD_DRAW_FOUR':
      symbol = <span>+4</span>;
      break;
  }
  return (
    <>
      {symbol}
      {color && <SuitIcon color={color} className="pc-index-suit" />}
    </>
  );
}

function CardBack() {
  return (
    <div className="pc-back">
      <span className="pc-back-emblem">
        {COLORS.map((color) => (
          <SuitIcon key={color} color={color} className={`pc-back-suit pc-back-suit-${color.toLowerCase()}`} />
        ))}
      </span>
    </div>
  );
}

/**
 * Original card: cream card stock, lacquered color panel with a faint suit weave,
 * embossed central symbol, corner indices and a light sheen. Size comes from --cw.
 */
export const GameCard = memo(function GameCard({ card, faceDown, className = '', style }: GameCardProps) {
  const cardName = useCardName();
  const { t } = useI18n();

  if (!card || faceDown) {
    return (
      <div className={`pc-card ${className}`} style={style} role="img" aria-label={t('cards.back')}>
        <CardBack />
      </div>
    );
  }

  const color = card.color === 'WILD' ? null : (card.color as CardColor);
  return (
    <div className={`pc-card ${className}`} style={style} role="img" aria-label={cardName(card)}>
      <div
        className={`pc-face ${color ? COLOR_THEME[color].className : 'pc-wild'}`}
        style={color ? { backgroundImage: `${suitPattern(color)}, var(--pc-face-light)` } : undefined}
      >
        <span className="pc-frame" />
        <span className="pc-index pc-index-tl">
          <Index card={card} color={color} />
        </span>
        <span className="pc-center">
          <span className="pc-lens" />
          <Center card={card} />
        </span>
        <span className="pc-index pc-index-br">
          <Index card={card} color={color} />
        </span>
      </div>
    </div>
  );
});
