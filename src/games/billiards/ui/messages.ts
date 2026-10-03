// What the last shot meant, in words, for the toast over the table.
import type { PublicState } from './GameView';

type T = (key: string, vars?: Record<string, string | number>) => string;

export function shotMessage(t: T, s: PublicState): string | null {
  const last = s.last;
  if (!last || s.phase === 'over') return null;
  const shooter = s.players[last.by].name;
  const next = s.players[s.turn].name;
  if (last.foul) return `${t(`billiards.foul.${last.foul}`)} · ${t('billiards.msg.ballInHand', { name: next })}`;
  if (last.assigned) return t('billiards.msg.assigned', { name: shooter, group: t(`billiards.group.${last.assigned}`) });
  if (last.again) return t('billiards.msg.again', { name: shooter });
  return t('billiards.msg.turn', { name: next });
}

export function endReason(t: T, s: PublicState): string {
  const loser = s.winner === null ? '' : s.players[s.winner === 0 ? 1 : 0].name;
  return t(`billiards.end.${s.reason ?? 'eight'}`, { name: loser });
}
