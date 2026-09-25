// A Jewellery level: HUD (goals, moves, score and stars), the board, and the result.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Check, RotateCcw, Star, Volume2, VolumeX } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { isLiteDevice } from '@/components/scene/particles';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { newMatchSeed } from '@/games/shared/rng';
import { LEVELS, levelById, starsFor } from '../engine';
import type { GoalProgress, LevelDef } from '../engine';
import { localProgress, recordResult } from '../progress';
import { JewelDefs } from './JewelDefs';
import { JewelBoard } from './JewelBoard';
import { useJewelGame } from './useJewelGame';
import type { SparkLayer } from './particles';
import { playJewel } from './jewelAudio';
import './jewels.css';

export function JewelPlayScreen() {
  const { params } = useNavigation();
  const level = levelById(params.level ?? localProgress.load().current);
  const [attempt, setAttempt] = useState(0);
  useGameMusic('jewels');
  return (
    <div className="jws">
      <JewelDefs />
      <Level key={`${level.id}-${attempt}`} level={level} onRetry={() => setAttempt((n) => n + 1)} />
    </div>
  );
}

function GoalIcon({ goal }: { goal: GoalProgress['goal'] }) {
  if (goal.type === 'collect')
    return (
      <svg viewBox="0 0 100 100" className="jws-goal-icon" aria-hidden>
        <use href={`#jw${goal.kind}`} />
      </svg>
    );
  if (goal.type === 'ice') return <span className="jws-goal-icon jws-ice-icon" aria-hidden />;
  return <Star className="jws-goal-icon text-[var(--cz-gold)]" aria-hidden />;
}

function Level({ level, onRetry }: { level: LevelDef; onRetry: () => void }) {
  const { t } = useI18n();
  const { navigate, back } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const reduced = !preferences.animations || prefersReducedMotion();
  const sparkCap = reduced ? 0 : isLiteDevice() ? 60 : 160;
  const seed = useMemo(() => newMatchSeed(), []);
  const sparks = useRef<SparkLayer | null>(null);
  const cellPx = useRef(0);
  const game = useJewelGame(level, seed, { reduced, sparks, cellPx });
  const { state, hud } = game;

  // Board size: the largest that fits the free space, keeping square cells (one ResizeObserver).
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setSize(Math.floor(Math.min(w, (h * level.cols) / level.rows, 640)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [level.cols, level.rows]);
  cellPx.current = size / level.cols;

  // Save the result once the level ends, then show it.
  const [result, setResult] = useState<null | { won: boolean; stars: number; best: number }>(null);
  useEffect(() => {
    if (game.machine !== 'ended') return;
    const won = state.status === 'won';
    const stars = won ? Math.max(1, starsFor(state.score, level.stars)) : 0;
    const before = localProgress.load();
    const after = recordResult(before, level.id, won, state.score, stars);
    localProgress.save(after);
    const id = window.setTimeout(() => setResult({ won, stars, best: after.best[level.id]?.score ?? state.score }), reduced ? 150 : 550);
    return () => clearTimeout(id);
  }, [game.machine, state.status, state.score, level, reduced]);
  useEffect(() => {
    if (!result?.won || reduced) return;
    const ids = [0, 1, 2].filter((i) => i < result.stars).map((i) => window.setTimeout(() => playJewel('star', i), 250 + i * 220));
    return () => ids.forEach(clearTimeout);
  }, [result, reduced]);

  const top = level.stars[2];
  const pct = Math.min(100, (hud.score / top) * 100);
  const next = LEVELS.find((l) => l.id === level.id + 1);

  return (
    <>
      <header className="jws-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => back('jewels')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="jws-level">
          <span>{t('jewels.level')}</span> {level.id}
        </p>
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setPreference('sound', !preferences.sound)} aria-label={t('jewels.sound')} aria-pressed={preferences.sound}>
          {preferences.sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </header>

      <section className="jws-hud" aria-label={t('jewels.hud')}>
        <div className="jws-goals">
          <span className="jws-cap">{t('jewels.goal')}</span>
          <div className="jws-goal-list">
            {game.goals.map((g, i) => (
              <span key={i} className={`jws-goal ${g.done ? 'is-done' : ''}`} aria-label={t('jewels.goalAria', { current: g.current, target: g.target })}>
                <GoalIcon goal={g.goal} />
                {g.done ? <Check className="w-4 h-4" aria-hidden /> : <b>{g.goal.type === 'score' ? g.target.toLocaleString() : g.target - g.current}</b>}
              </span>
            ))}
          </div>
        </div>
        <div className={`jws-moves ${hud.movesLeft <= 5 ? 'is-low' : ''}`}>
          <span className="jws-cap">{t('jewels.moves')}</span>
          <b aria-live="polite">{hud.movesLeft}</b>
        </div>
        <div className="jws-score">
          <div className="flex items-baseline justify-between gap-2">
            <span className="jws-cap">{t('jewels.score')}</span>
            <b>{hud.score.toLocaleString()}</b>
          </div>
          <div className="jws-bar" role="progressbar" aria-valuemin={0} aria-valuemax={top} aria-valuenow={Math.min(top, hud.score)} aria-label={t('jewels.progress')}>
            <span style={{ transform: `scaleX(${pct / 100})` }} />
            {level.stars.map((s, i) => (
              <Star key={i} className={`jws-bar-star ${hud.score >= s ? 'is-on' : ''}`} style={{ left: `${(s / top) * 100}%` } as CSSProperties} aria-hidden />
            ))}
          </div>
        </div>
      </section>

      <div ref={area} className="jws-area">
        {size > 0 && (
          <JewelBoard
            rows={level.rows}
            cols={level.cols}
            size={size}
            pieces={game.pieces}
            ice={game.ice}
            effects={game.effects}
            combo={game.combo}
            moveMs={game.moveMs}
            selected={game.selected}
            busy={game.machine !== 'idle'}
            sparkCap={sparkCap}
            sparks={sparks}
            onTap={game.tap}
            onSwipe={(a, b) => void game.attempt(a, b)}
          />
        )}
      </div>

      {result && (
        <div className="jws-modal" role="dialog" aria-modal="true" aria-labelledby="jws-result">
          <div className="jws-card">
            <h2 id="jws-result" className="jws-card-title">
              {result.won ? t('jewels.won') : t('jewels.lost')}
            </h2>
            {result.won ? (
              <div className="jws-stars" aria-label={t('jewels.starsAria', { n: result.stars })}>
                {[0, 1, 2].map((i) => (
                  <Star key={i} className={`jws-star ${i < result.stars ? 'is-on' : ''}`} style={{ animationDelay: `${250 + i * 220}ms` }} aria-hidden />
                ))}
              </div>
            ) : (
              <p className="jws-card-sub">{t('jewels.lostHint')}</p>
            )}
            <p className="jws-final">
              <span>{t('jewels.score')}</span>
              <b>{state.score.toLocaleString()}</b>
            </p>
            {result.won && <p className="jws-card-sub">{t('jewels.best', { n: result.best.toLocaleString() })}</p>}
            <div className="jws-actions">
              {result.won && next && (
                <button type="button" className="jws-cta" onClick={() => navigate('jewelsPlay', { level: next.id }, { replace: true })}>
                  {t('jewels.next')}
                </button>
              )}
              {!result.won && (
                <button type="button" className="jws-cta" onClick={onRetry}>
                  <RotateCcw className="w-5 h-5" aria-hidden /> {t('jewels.retry')}
                </button>
              )}
              <div className="jws-actions-row">
                {result.won && (
                  <button type="button" className="cz-btn cz-btn-secondary" onClick={onRetry}>
                    <RotateCcw className="w-4 h-4" aria-hidden /> {t('jewels.replay')}
                  </button>
                )}
                <button type="button" className="cz-btn cz-btn-secondary" onClick={() => navigate('jewels', { levels: true }, { replace: true })}>
                  {t('jewels.levels')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
