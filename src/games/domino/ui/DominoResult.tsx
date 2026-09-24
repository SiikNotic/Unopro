import { Crown, LogOut, Play, RotateCcw } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { useI18n } from '@/i18n';
import type { DominoView } from '../engine';

/** End of a round (and of the match): who won and why, what every hand still held, the running score. */
export function DominoResult({ view, mine, onNext, onRematch, onExit }: { view: DominoView; mine: string[]; onNext: () => void; onRematch: (() => void) | null; onExit: () => void }) {
  const { t } = useI18n();
  const r = view.lastResult!;
  const over = view.status === 'game_over';
  const name = (id: string) => view.seats.find((p) => p.id === id)?.name ?? id;
  const title = over
    ? view.matchWinners.length > 1
      ? t('domino.matchTie')
      : t(mine.includes(view.matchWinners[0]) && mine.length === 1 ? 'domino.matchYouWin' : 'domino.matchWinner', { name: name(view.matchWinners[0]) })
    : r.winnerId
      ? t(r.reason === 'domino' ? 'domino.dominoBy' : 'domino.blockedBy', { name: name(r.winnerId) })
      : t('domino.blockedTie');
  const ranked = [...view.seats].sort((a, b) => b.score - a.score);
  const target = view.targetScore;
  return (
    <Sheet title={over ? t('domino.matchOver') : t('domino.roundN', { n: r.round })} onClose={over ? onExit : onNext}>
      <div className="text-center">
        <p className="font-display font-extrabold text-2xl text-white">{title}</p>
        <p className="mt-1 text-sm text-white/70">
          {r.winnerId ? t('domino.points', { n: r.points }) : t('domino.noPoints')} · {t(r.reason === 'domino' ? 'domino.reasonDomino' : 'domino.reasonBlocked')}
        </p>
      </div>
      <ul className="mt-5 flex flex-col gap-2" aria-label={t('domino.scoreboard')}>
        {ranked.map((p) => {
          const winner = over ? view.matchWinners.includes(p.id) : r.winnerId === p.id;
          return (
            <li key={p.id} className={`rounded-xl px-3 py-2.5 border ${winner ? 'border-[rgba(216,178,106,0.7)] bg-[rgba(216,178,106,0.12)]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="flex items-center gap-2">
                {winner && <Crown className="w-4 h-4 text-[var(--cz-gold)] shrink-0" aria-hidden />}
                <span className="font-bold text-white truncate">{p.name}</span>
                <span className="ml-auto text-xs text-white/60 whitespace-nowrap">{t('domino.pipsLeft', { n: r.pips[p.id] })}</span>
                <span className="w-12 text-right font-extrabold text-white cz-num">{p.score}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-gradient-to-r from-[#b98b3e] to-[#f3dfae]" style={{ width: `${Math.min(100, (p.score / target) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-white/50 text-center">{t('domino.toWin', { n: target })}</p>
      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        {over ? (
          <>
            {onRematch && (
              <button type="button" className="cz-btn cz-btn-primary cz-btn-lg flex-1" onClick={onRematch}>
                <RotateCcw className="w-5 h-5" /> {t('games.rematch')}
              </button>
            )}
            <button type="button" className="cz-btn cz-btn-secondary cz-btn-lg flex-1" onClick={onExit}>
              <LogOut className="w-5 h-5" /> {t('games.exit')}
            </button>
          </>
        ) : (
          <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full" onClick={onNext}>
            <Play className="w-5 h-5" /> {t('domino.nextRound')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
