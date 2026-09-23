import type { GameLogEntry } from '@/game/engine';
import { COLOR_THEME } from './cardTheme';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Localised one-liner for the log entries worth showing to players; null for the rest. */
export function eventText(
  entry: GameLogEntry,
  nameOf: (id: string) => string,
  cardName: (c: NonNullable<GameLogEntry['card']>) => string,
  t: T,
  localPlayerId?: string
): string | null {
  const name = entry.playerId ? nameOf(entry.playerId) : '';
  // Second-person phrasing when the event is about the local player ("You play…" / "Juegas…").
  const you = !!localPlayerId && entry.playerId === localPlayerId;
  const k = (key: string) => `table.events.${key}${you ? 'You' : ''}`;
  switch (entry.type) {
    case 'PLAYER_PLAYED_CARD':
      return entry.card ? t(k('played'), { name, card: cardName(entry.card) }) : null;
    case 'PLAYER_JUMPED_IN':
      return t(k('jumpedIn'), { name });
    case 'PLAYER_DREW_CARD':
      return t(k('drew'), { name, amount: entry.amount ?? 0 });
    case 'PLAYER_PASSED':
      return t(k('passed'), { name });
    case 'PLAYER_SKIPPED':
      return t(k('skipped'), { name });
    case 'DIRECTION_CHANGED':
      return t('table.events.reversed');
    case 'DRAW_PENALTY':
      return entry.playerId ? t(k('drawPenalty'), { name, amount: entry.amount ?? 0 }) : t('table.events.drawStack', { amount: entry.amount ?? 0 });
    case 'COLOR_CHANGED':
      return entry.color ? t(k('colorChanged'), { name, color: t(COLOR_THEME[entry.color].labelKey) }) : null;
    case 'PLAYER_CALLED_UNO':
      return t(k('calledUno'), { name });
    case 'UNO_PENALTY':
      return t(k('unoPenalty'), { name, amount: entry.amount ?? 0 });
    case 'DECK_RECYCLED':
      return t('table.events.recycled');
    case 'ROUND_STARTED':
      return t('table.events.roundStarted', { round: entry.roundNumber });
    default:
      return null;
  }
}
