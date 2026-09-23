import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import type { GameState } from '@/game/engine';
import { COLORS, getGameWinningTeam, getRoundWinningTeam } from '@/game/engine';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { SuitIcon } from './cardArt';

interface RoundResultProps {
  state: GameState;
  localPlayerId: string;
  nameOf: (playerId: string) => string;
  onNextRound: () => void;
  onRestart: () => void;
  onExit: () => void;
}

const CONFETTI_COLORS = ['text-[var(--pc-red)]', 'text-[var(--pc-yellow)]', 'text-[var(--pc-green)]', 'text-[var(--pc-blue)]'];

/** A handful of suit shapes bursting once from the trophy — only when the local side wins. */
function Celebration() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const dist = 90 + (i % 3) * 28;
        return {
          color: COLORS[i % 4],
          style: {
            '--dx': `${Math.cos(angle) * dist}px`,
            '--dy': `${Math.sin(angle) * dist - 20}px`,
            '--rot': `${(i % 2 ? 1 : -1) * (120 + i * 17)}deg`,
            animationDelay: `${(i % 4) * 40}ms`,
          } as React.CSSProperties,
          className: CONFETTI_COLORS[i % 4],
        };
      }),
    []
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-7" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} className={`absolute -ml-2 -mt-2 animate-confetti ${p.className}`} style={p.style}>
          <SuitIcon color={p.color} className="w-4 h-4" />
        </span>
      ))}
    </div>
  );
}

/** End-of-round scorecard. Every number comes from the engine's RoundResult and cumulative scores. */
export function RoundResult({ state, localPlayerId, nameOf, onNextRound, onRestart, onExit }: RoundResultProps) {
  const { t } = useI18n();
  const round = state.rounds[state.rounds.length - 1];
  if (!round) return null;
  const gameOver = state.status === 'GAME_OVER';
  const roundTeam = getRoundWinningTeam(state);
  const gameTeam = getGameWinningTeam(state);
  const localTeam = state.players.find((p) => p.id === localPlayerId)?.teamId;
  const localWon = round.winnerId === localPlayerId || (!!roundTeam && roundTeam.id === localTeam);
  const ranking = [...state.players].sort((a, b) => (round.handPoints[a.id] ?? 0) - (round.handPoints[b.id] ?? 0));

  const headline = gameTeam
    ? t('table.teamWinsGame', { team: gameTeam.name })
    : roundTeam
      ? t('table.teamWinsRound', { team: roundTeam.name, name: nameOf(round.winnerId) })
      : round.winnerId === localPlayerId
        ? t('table.youWinRound')
        : t('table.winsRound', { name: nameOf(round.winnerId) });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="round-title">
      <div className="panel panel-brass relative w-full max-w-md overflow-hidden rounded-3xl p-6 animate-rise">
        {localWon && <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-sheen" />}
        <div className="relative flex flex-col items-center text-center">
          {localWon && <Celebration />}
          <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-glow-gold ${localWon ? 'bg-gradient-to-br from-gold-400 to-gold-600' : 'bg-ink-700'}`}>
            <Trophy className={`w-7 h-7 ${localWon ? 'text-ink-950' : 'text-gold-400'}`} />
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-ink-400 font-semibold">
            {gameOver ? t('table.gameOver') : t('table.roundOver', { round: round.roundNumber })}
          </p>
          <h2 id="round-title" className="mt-1 font-display font-extrabold text-2xl text-balance">
            {headline}
          </h2>
          <p className="mt-1 font-bold text-gold-400 tabular-nums">{t('table.points', { points: round.points })}</p>
        </div>

        <table className="relative mt-5 w-full text-sm">
          <thead>
            <tr className="text-ink-400 text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium pb-2" />
              <th className="text-right font-medium pb-2">{t('table.cardsLeft')}</th>
              <th className="text-right font-medium pb-2">{t('table.totalScore')}</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((p) => (
              <tr key={p.id} className={`border-t border-white/5 ${p.id === round.winnerId ? 'text-gold-400 font-semibold' : ''}`}>
                <td className="py-1.5 truncate">{nameOf(p.id)}</td>
                <td className="py-1.5 text-right tabular-nums">{round.handPoints[p.id]}</td>
                <td className="py-1.5 text-right tabular-nums">{state.scores[p.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {state.settings.teamMode && (
          <div className="relative mt-3 flex justify-center gap-3 text-sm">
            {state.teams.map((team) => (
              <span key={team.id} className={`chip rounded-full px-3 py-1 ${team.id === localTeam ? 'text-gold-400' : ''}`}>
                {t('table.teamLabel', { team: team.name })}: <strong className="tabular-nums">{state.teamScores[team.id] ?? 0}</strong>
              </span>
            ))}
          </div>
        )}

        <div className="relative mt-6 flex flex-col gap-2">
          {!gameOver && (
            <Button fullWidth onClick={onNextRound} autoFocus>
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
