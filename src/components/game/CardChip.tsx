import type { Card } from '@/game/engine';
import { cardLabel } from '@/game/engine';
import { COLOR_CLASSES } from './cardColors';

interface CardChipProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
}

export function CardChip({ card, onClick, disabled, highlight }: CardChipProps) {
  const label = card.type === 'NUMBER' ? String(card.value) : cardLabel(card).replace(`${card.color} `, '');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={`${cardLabel(card)} (${card.id})`}
      className={`w-14 h-20 rounded-lg border-2 font-bold text-sm flex items-center justify-center text-center leading-tight px-1 transition ${COLOR_CLASSES[card.color]} ${
        highlight ? 'border-white ring-2 ring-white/60' : 'border-black/30'
      } disabled:opacity-40 enabled:hover:-translate-y-1`}
    >
      {label}
    </button>
  );
}
