// Derives what visibly happened between two consecutive GameStates, so the UI can animate it.
// Reads only the engine's state and log; never decides anything about the rules.
import type { Card, CardColor, GameLogEntry, GameState } from '@/game/engine';

export interface TableEvents {
  /** A new round was dealt. */
  dealt: boolean;
  /** Card that landed on the discard pile and who played it. */
  played: { card: Card; playerId: string } | null;
  /** Cards added to each player's hand (ids are only meaningful to whoever may see them). */
  drawn: { playerId: string; count: number; cardIds: string[] }[];
  colorChanged: CardColor | null;
  turnChanged: boolean;
  unoCalls: { playerId: string; valid: boolean }[];
  unoPenalties: { playerId: string; amount: number }[];
  /** Log entries added by this change. */
  newLog: GameLogEntry[];
}

export function getTableEvents(prev: GameState | null, next: GameState): TableEvents {
  const lastSeq = prev && prev.roundNumber === next.roundNumber ? prev.log[prev.log.length - 1]?.seq ?? 0 : -1;
  const newLog = lastSeq < 0 ? next.log.filter((e) => e.roundNumber === next.roundNumber) : next.log.filter((e) => e.seq > lastSeq);
  const dealt = !prev || prev.roundNumber !== next.roundNumber;

  const playedEntry = [...newLog].reverse().find((e) => e.type === 'PLAYER_PLAYED_CARD');
  const played = playedEntry?.card && playedEntry.playerId ? { card: playedEntry.card, playerId: playedEntry.playerId } : null;

  const drawn: TableEvents['drawn'] = [];
  if (prev && !dealt) {
    for (const player of next.players) {
      const before = prev.players.find((p) => p.id === player.id);
      if (!before) continue;
      const known = new Set(before.hand.map((c) => c.id));
      const cardIds = player.hand.filter((c) => !known.has(c.id)).map((c) => c.id);
      if (cardIds.length > 0) drawn.push({ playerId: player.id, count: cardIds.length, cardIds });
    }
  }

  return {
    dealt,
    played,
    drawn,
    colorChanged: next.currentColor && next.currentColor !== prev?.currentColor ? next.currentColor : null,
    turnChanged: !prev || prev.turnNumber !== next.turnNumber || prev.currentPlayerIndex !== next.currentPlayerIndex,
    unoCalls: next.unoState.calls
      .slice(dealt ? 0 : prev!.unoState.calls.length)
      .map((c) => ({ playerId: c.playerId, valid: c.valid })),
    unoPenalties: newLog
      .filter((e) => e.type === 'UNO_PENALTY' && e.playerId)
      .map((e) => ({ playerId: e.playerId!, amount: e.amount ?? 0 })),
    newLog,
  };
}
