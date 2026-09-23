import type { GameLogEntry } from '@/game/engine';
import { COLOR_THEME } from './cardTheme';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Localised one-liner for the log entries worth showing to players; null for the rest. */
export function eventText(entry: GameLogEntry, nameOf: (id: string) => string, cardName: (c: NonNullable<GameLogEntry['card']>) => string, t: T): string | null {
  const name = entry.playerId ? nameOf(entry.playerId) : '';
  switch (entry.type) {
    case 'PLAYER_PLAYED_CARD':
      return entry.card ? t('table.events.played', { name, card: cardName(entry.card) }) : null;
    case 'PLAYER_JUMPED_IN':
      return t('table.events.jumpedIn', { name });
    case 'PLAYER_DREW_CARD':
      return t('table.events.drew', { name, amount: entry.amount ?? 0 });
    case 'PLAYER_PASSED':
      return t('table.events.passed', { name });
    case 'PLAYER_SKIPPED':
      return t('table.events.skipped', { name });
    case 'DIRECTION_CHANGED':
      return t('table.events.reversed');
    case 'DRAW_PENALTY':
      return entry.playerId ? t('table.events.drawPenalty', { name, amount: entry.amount ?? 0 }) : t('table.events.drawStack', { amount: entry.amount ?? 0 });
    case 'COLOR_CHANGED':
      return entry.color ? t('table.events.colorChanged', { name, color: t(COLOR_THEME[entry.color].labelKey) }) : null;
    case 'PLAYER_CALLED_UNO':
      return t('table.events.calledUno', { name });
    case 'UNO_PENALTY':
      return t('table.events.unoPenalty', { name, amount: entry.amount ?? 0 });
    case 'DECK_RECYCLED':
      return t('table.events.recycled');
    case 'ROUND_STARTED':
      return t('table.events.roundStarted', { round: entry.roundNumber });
    default:
      return null;
  }
}
