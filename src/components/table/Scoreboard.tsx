import { Trophy, Users } from 'lucide-react';
import type { GameState } from '@/game/engine';
import { useI18n } from '@/i18n';

/** Compact, wrapping score chips: round, then team totals (team mode) or your total. */
export function Scoreboard({ state, localPlayerId }: { state: GameState; localPlayerId: string }) {
  const { t } = useI18n();
  const localTeam = state.players.find((p) => p.id === localPlayerId)?.teamId;
  return (
    <div className="flex flex-nowrap items-center justify-center gap-1 sm:gap-1.5 min-w-0" aria-label={t('table.scoreboard')}>
      <span className="chip rounded-full px-2 sm:px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-400 tabular-nums whitespace-nowrap">
        {t('table.roundShort', { round: state.roundNumber })}
      </span>
      {state.settings.teamMode ? (
        state.teams.map((team) => {
          const mine = team.id === localTeam;
          return (
            <span
              key={team.id}
              className={`chip rounded-full px-2 sm:px-2.5 py-1 text-xs font-bold flex items-center gap-1 tabular-nums whitespace-nowrap ${mine ? 'text-gold-400 border-gold-400/40' : ''}`}
              title={t('table.teamLabel', { team: team.name })}
            >
              {mine && <Users className="w-3.5 h-3.5" aria-hidden />}
              <span className="sr-only">{t('table.teamLabel', { team: team.name })}</span>
              <span aria-hidden>{team.name}</span>
              <span>{state.teamScores[team.id] ?? 0}</span>
            </span>
          );
        })
      ) : (
        <span className="chip rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 text-gold-400 tabular-nums whitespace-nowrap">
          <Trophy className="w-3.5 h-3.5" aria-hidden />
          <span className="sr-only">{t('table.yourScoreLabel')}</span>
          {state.scores[localPlayerId] ?? 0}
        </span>
      )}
    </div>
  );
}
