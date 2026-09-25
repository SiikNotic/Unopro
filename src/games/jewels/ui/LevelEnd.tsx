// The end of a level. Won: the laurel, the stars one by one, the score counting up, the power-up earned,
// Continue / Replay / Levels. Lost: which goals were missing, the score, Restart / Levels.
// One requestAnimationFrame counter while the score counts up (cancelled on unmount); nothing else runs.
import { useEffect, useState } from 'react';
import { Check, Map as MapIcon, Play, RotateCcw, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Booster, GoalProgress } from '../engine';
import { BoosterIcon, Laurel, StarIcon } from './OlympusArt';
import { playJewel } from './jewelAudio';

function useCountUp(target: number, ms: number, active: boolean) {
  const [value, setValue] = useState(active ? 0 : target);
  useEffect(() => {
    if (!active) return setValue(target);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, active]);
  return value;
}

interface LevelEndProps {
  won: boolean;
  levelId: number;
  score: number;
  best: number;
  stars: number;
  reward: Booster | null;
  goals: GoalProgress[];
  animate: boolean;
  hasNext: boolean;
  onNext: () => void;
  onRetry: () => void;
  onLevels: () => void;
}

export function LevelEnd({ won, levelId, score, best, stars, reward, goals, animate, hasNext, onNext, onRetry, onLevels }: LevelEndProps) {
  const { t } = useI18n();
  const shown = useCountUp(score, 900, animate && won);
  useEffect(() => {
    if (!won || !animate) return;
    const ids = [0, 1, 2].filter((i) => i < stars).map((i) => window.setTimeout(() => playJewel('star', i), 420 + i * 260));
    return () => ids.forEach(clearTimeout);
  }, [won, stars, animate]);

  return (
    <div className={`ol-end ${won ? 'is-won' : 'is-lost'}`} role="dialog" aria-modal="true" aria-labelledby="ol-end-title">
      {won && animate && <div className="ol-end-rays" aria-hidden />}
      <div className="ol-card">
        <Laurel className="ol-card-laurel" />
        <p className="ol-card-kicker">{t('jewels.levelN', { n: levelId })}</p>
        <h2 id="ol-end-title" className="ol-card-title">
          {won ? t('jewels.won') : t('jewels.lost')}
        </h2>
        {won ? (
          <div className="ol-stars" aria-label={t('jewels.starsAria', { n: stars })}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`ol-star ${i < stars ? 'is-on' : ''}`} style={{ animationDelay: `${420 + i * 260}ms` }}>
                <StarIcon on={i < stars} />
              </span>
            ))}
          </div>
        ) : (
          <ul className="ol-missing" aria-label={t('jewels.goal')}>
            {goals.map((g, i) => (
              <li key={i} className={g.done ? 'is-done' : ''}>
                {g.done ? <Check className="w-4 h-4" aria-hidden /> : <X className="w-4 h-4" aria-hidden />}
                <span>{t(`jewels.goalName.${g.goal.type}`)}</span>
                <b>
                  {g.goal.type === 'score' ? `${g.current.toLocaleString()} / ${g.target.toLocaleString()}` : `${g.current} / ${g.target}`}
                </b>
              </li>
            ))}
          </ul>
        )}
        <p className="ol-final">
          <span>{t('jewels.score')}</span>
          <b>{shown.toLocaleString()}</b>
        </p>
        {won && <p className="ol-card-sub">{t('jewels.best', { n: best.toLocaleString() })}</p>}
        {!won && <p className="ol-card-sub">{t('jewels.lostHint')}</p>}
        {won && reward && (
          <p className="ol-reward">
            <span className="ol-reward-icon">
              <BoosterIcon booster={reward} />
            </span>
            {t('jewels.reward', { name: t(`jewels.booster.${reward}`) })}
          </p>
        )}
        <div className="ol-actions">
          {won && hasNext ? (
            <button type="button" className="ol-cta" onClick={onNext}>
              <Play className="w-5 h-5" fill="currentColor" aria-hidden /> {t('jewels.next')}
            </button>
          ) : !won ? (
            <button type="button" className="ol-cta" onClick={onRetry}>
              <RotateCcw className="w-5 h-5" aria-hidden /> {t('jewels.retry')}
            </button>
          ) : null}
          <div className="ol-actions-row">
            {won && (
              <button type="button" className="ol-ghost" onClick={onRetry}>
                <RotateCcw className="w-4 h-4" aria-hidden /> {t('jewels.replay')}
              </button>
            )}
            <button type="button" className="ol-ghost" onClick={onLevels}>
              <MapIcon className="w-4 h-4" aria-hidden /> {t('jewels.levels')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
