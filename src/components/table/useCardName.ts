import type { Card } from '@/game/engine';
import { useI18n } from '@/i18n';
import { COLOR_THEME } from './cardTheme';

/** Localised, screen-reader friendly card name, e.g. "7 Red" or "Wild draw four". */
export function useCardName() {
  const { t } = useI18n();
  return (card: Card) => {
    const type = card.type === 'NUMBER' ? String(card.value) : t(`cards.types.${card.type}`);
    return card.color === 'WILD' ? type : `${type} ${t(COLOR_THEME[card.color].labelKey)}`;
  };
}
