// The HUD over the board: the Olympian medallion with the moves, the score with its star bar, and the goals.
// Marble plaques with gold rims; the numbers are the only things that change.
import { memo } from 'react';
import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GoalProgress, LevelDef } from '../engine';
import { OlympianMedallion, StarIcon } from './OlympusArt';

function GoalIcon({ goal }: { goal: GoalProgress['goal'] }) {
  switch (goal.type) {
    case 'collect':
      return (
        <svg viewBox="0 0 100 100" className="ol-goal-icon" aria-hidden>
          <use href={`#jw${goal.kind}`} />
        </svg>
      );
    case 'ice':
      return <span className="ol-goal-icon ol-goal-ice" aria-hidden />;
    case 'stone':
      return (
        <svg viewBox="0 0 100 100" className="ol-goal-icon" aria-hidden>
          <use href="#jw-stone2" />
        </svg>
      );
    case 'specials':
      return (
        <svg viewBox="0 0 100 100" className="ol-goal-icon" aria-hidden>
          <use href="#jw-bolt" />
        </svg>
      );
    case 'combos':
      return <span className="ol-goal-icon ol-goal-text">×</span>;
    case 'matches':
      return <span className="ol-goal-icon ol-goal-text">3</span>;
    default:
      return <StarIcon on className="ol-goal-icon" />;
  }
}

interface HudProps {
  level: LevelDef;
  score: number;
  movesLeft: number;
  goals: GoalProgress[];
}

export const OlympusHud = memo(function OlympusHud({ level, score, movesLeft, goals }: HudProps) {
  const { t } = useI18n();
  const top = level.stars[2];
  const pct = Math.min(1, score / top);
  return (
    <section className="ol-hud" aria-label={t('jewels.hud')}>
      <div className="ol-moves">
        <OlympianMedallion size={58} />
        <div className={`ol-plaque ol-moves-plaque ${movesLeft <= 5 ? 'is-low' : ''}`}>
          <span className="ol-cap">{t('jewels.moves')}</span>
          <b aria-live="polite">{movesLeft}</b>
        </div>
      </div>
      <div className="ol-plaque ol-score">
        <span className="ol-cap">{t('jewels.score')}</span>
        <b>{score.toLocaleString()}</b>
        <div className="ol-bar" role="progressbar" aria-valuemin={0} aria-valuemax={top} aria-valuenow={Math.min(top, score)} aria-label={t('jewels.progress')}>
          <span style={{ transform: `scaleX(${pct})` }} />
          {level.stars.map((s, i) => (
            <i key={i} style={{ left: `${(s / top) * 100}%` } as CSSProperties}>
              <StarIcon on={score >= s} className="ol-bar-star" />
            </i>
          ))}
        </div>
      </div>
      <div className="ol-goals" aria-label={t('jewels.goal')}>
        {goals.map((g, i) => (
          <span key={i} className={`ol-goal ${g.done ? 'is-done' : ''}`} title={t(`jewels.goalName.${g.goal.type}`)} aria-label={`${t(`jewels.goalName.${g.goal.type}`)}: ${t('jewels.goalAria', { current: g.current, target: g.target })}`}>
            <GoalIcon goal={g.goal} />
            {g.done ? <Check className="w-4 h-4" aria-hidden /> : <b>{g.goal.type === 'score' ? g.target.toLocaleString() : g.target - g.current}</b>}
          </span>
        ))}
      </div>
    </section>
  );
});
