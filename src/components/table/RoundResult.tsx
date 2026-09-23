import { Trophy } from 'lucide-react';
import type { GameState } from '@/game/engine';
import { getGameWinningTeam, getRoundWinningTeam } from '@/game/engine';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';

interface RoundResultProps {
  state: GameState;
  localPlayerId: string;
  nameOf: (playerId: string) => string;
  onNextRound: () => void;
  onRestart: () => void;
  onExit: () => void;
}

/** End-of-round summary. All numbers come from the engine's RoundResult and cumulative scores. */
export function RoundResult({ state, localPlayerId, nameOf, onNextRound, onRestart, onExit }: RoundResultProps) {
  const { t } = useI18n();
  const round = state.rounds[state.rounds.length - 1];
  if (!round) return null;
  const gameOver = state.status === 'GAME_OVER';
  const roundTeam = getRoundWinningTeam(state);
  const gameTeam = getGameWinningTeam(state);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-ink-900/95 border border-white/10 p-6 shadow-card animate-scale-in">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-glow-gold">
            <Trophy className="w-7 h-7 text-ink-950" />
          </div>
          <h2 className="mt-3 font-display font-extrabold text-2xl">
            {gameOver ? t('table.gameOver') : t('table.roundOver', { round: round.roundNumber })}
          </h2>
          <p className="mt-1 text-ink-400">
            {gameTeam
              ? t('table.teamWinsGame', { team: gameTeam.name })
              : roundTeam
                ? t('table.teamWinsRound', { team: roundTeam.name, name: nameOf(round.winnerId) })
                : round.winnerId === localPlayerId
                  ? t('table.youWinRound')
                  : t('table.winsRound', { name: nameOf(round.winnerId) })}
          </p>
          <p className="mt-1 font-bold text-gold-400">{t('table.points', { points: round.points })}</p>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-ink-400 text-xs">
              <th className="text-left font-medium pb-2" />
              <th className="text-right font-medium pb-2">{t('table.cardsLeft')}</th>
              <th className="text-right font-medium pb-2">{t('table.totalScore')}</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((p) => (
              <tr key={p.id} className={p.id === round.winnerId ? 'text-gold-400 font-semibold' : ''}>
                <td className="py-1 truncate">{nameOf(p.id)}</td>
                <td className="py-1 text-right tabular-nums">{round.handPoints[p.id]}</td>
                <td className="py-1 text-right tabular-nums">{state.scores[p.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {state.settings.teamMode && (
          <div className="mt-3 flex justify-center gap-4 text-sm">
            {state.teams.map((team) => (
              <span key={team.id}>
                {team.name}: <strong className="tabular-nums">{state.teamScores[team.id] ?? 0}</strong>
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {!gameOver && (
            <Button fullWidth onClick={onNextRound}>
              {t('table.nextRound')}
            </Button>
          )}
          <Button fullWidth variant="secondary" onClick={onRestart}>
            {t('table.restart')}
          </Button>
          <Button fullWidth variant="ghost" onClick={onExit}>
            {t('table.exit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
