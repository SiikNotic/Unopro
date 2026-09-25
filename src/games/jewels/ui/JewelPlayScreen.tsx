// A Jewellery: Olympus level: the Olympus scene, the HUD, the board in its marble-and-gold frame, the power-ups,
// and the end of the level. The layout is real, not a scaled picture: the board takes the free space
// (square cells), the HUD and power-ups stay compact on phones and breathe on wider screens.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { isLiteDevice } from '@/components/scene/particles';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { newMatchSeed } from '@/games/shared/rng';
import { LEVELS, levelById, starsFor } from '../engine';
import type { Booster, LevelDef } from '../engine';
import { localProgress, recordResult, spendBooster } from '../progress';
import type { JewelProgress } from '../progress';
import { JewelDefs } from './JewelDefs';
import { JewelBoard } from './JewelBoard';
import { OlympusScene } from './OlympusScene';
import { OlympusHud } from './OlympusHud';
import { PowerBar } from './PowerBar';
import { LevelEnd } from './LevelEnd';
import { useJewelGame } from './useJewelGame';
import { ICONS } from './assets';
import type { SparkLayer } from './particles';
import { playJewel } from './jewelAudio';
import './jewels.css';

// Development only: the dynamic import is dropped from production builds.
const JewelDevTools = import.meta.env.DEV ? lazy(() => import('./JewelDevTools')) : null;

/** The frame's rim as a share of the frame's width (matches .ol-frame padding in jewels.css). */
const RIM_X = 0.168;
const RIM_Y = 0.176;

export function JewelPlayScreen() {
  const { params } = useNavigation();
  const level = levelById(params.level ?? localProgress.load().current);
  const [attempt, setAttempt] = useState(0);
  useGameMusic('jewels');
  return (
    <div className="ol ol-play">
      <JewelDefs />
      <OlympusScene />
      <Level key={`${level.id}-${attempt}`} level={level} onRetry={() => setAttempt((n) => n + 1)} />
    </div>
  );
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
  const [progress, setProgress] = useState<JewelProgress>(() => localProgress.load());
  const onBoosterUsed = useCallback((b: Booster) => {
    const next = spendBooster(localProgress.load(), b);
    localProgress.save(next);
    setProgress(next);
  }, []);
  const game = useJewelGame(level, seed, { reduced, sparks, cellPx, onBoosterUsed });
  const { state, hud } = game;

  // Board size: the largest that fits the free space, keeping square cells (one ResizeObserver).
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      // frame width = size / (1 - RIM_X); frame height = board height + RIM_Y × frame width.
      const byWidth = el.clientWidth * (1 - RIM_X);
      const byHeight = el.clientHeight / (level.rows / level.cols + RIM_Y / (1 - RIM_X));
      setSize(Math.max(0, Math.floor(Math.min(byWidth, byHeight, 620))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [level.cols, level.rows]);
  cellPx.current = size / level.cols;

  // Save the result once the level ends, then show it.
  const ended = game.phase === 'LEVEL_COMPLETE' || game.phase === 'LEVEL_FAILED';
  const saved = useRef(false);
  const [result, setResult] = useState<null | { won: boolean; stars: number; best: number; reward: Booster | null }>(null);
  useEffect(() => {
    if (!ended || saved.current || state.status === 'playing') return;
    saved.current = true;
    const won = state.status === 'won';
    const stars = won ? Math.max(1, starsFor(state.score, level.stars)) : 0;
    const outcome = recordResult(localProgress.load(), level.id, won, state.score, stars);
    localProgress.save(outcome.progress);
    setProgress(outcome.progress);
    const id = window.setTimeout(() => setResult({ won, stars, best: outcome.progress.best[level.id]?.score ?? state.score, reward: outcome.reward }), reduced ? 150 : won ? 1100 : 600);
    return () => clearTimeout(id);
  }, [ended, state.status, state.score, level, reduced]);

  const next = LEVELS.find((l) => l.id === level.id + 1);
  const pick = (b: Booster) => {
    if (progress.boosters[b] <= 0) return;
    game.arm(b);
  };

  return (
    <>
      <header className="ol-top">
        <button type="button" className="ol-icon-btn" onClick={() => back('jewels')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="ol-level-plaque">
          <span>{t(`jewels.chapter.${Math.min(3, Math.floor((level.id - 1) / 5))}`)}</span>
          <b>{t('jewels.levelN', { n: level.id })}</b>
        </p>
        <button type="button" className={`ol-icon-btn${preferences.music ? '' : ' is-off'}`} onClick={() => setPreference('music', !preferences.music)} aria-label={t('jewels.music')} aria-pressed={preferences.music}>
          <img src={ICONS.music} alt="" />
        </button>
        <button type="button" className={`ol-icon-btn${preferences.sound ? '' : ' is-off'}`} onClick={() => setPreference('sound', !preferences.sound)} aria-label={t('jewels.sound')} aria-pressed={preferences.sound}>
          <img src={ICONS.sound} alt="" />
        </button>
      </header>

      <OlympusHud level={level} score={hud.score} movesLeft={hud.movesLeft} goals={game.goals} />

      <div ref={area} className="ol-area">
        {size > 0 && (
          <JewelBoard
            rows={level.rows}
            cols={level.cols}
            size={size}
            pieces={game.pieces}
            ice={game.ice}
            effects={game.effects}
            pops={game.pops}
            combo={game.combo}
            moveMs={game.moveMs}
            selected={game.selected}
            armed={game.armed}
            busy={game.busy}
            glints={!reduced}
            celebrate={game.phase === 'LEVEL_COMPLETE' && !reduced}
            sparkCap={sparkCap}
            sparks={sparks}
            onTap={game.tap}
            onSwipe={(a, b) => void game.attempt(a, b)}
          />
        )}
      </div>

      <div className="ol-bottom">
        <p className={`ol-aim ${game.armed ? 'is-on' : ''}`} aria-live="polite">
          {game.armed ? t(`jewels.boosterHint.${game.armed}`) : ' '}
        </p>
        <PowerBar inventory={progress.boosters} armed={game.armed} disabled={game.phase !== 'IDLE'} onPick={pick} />
      </div>

      {result && (
        <LevelEnd
          won={result.won}
          levelId={level.id}
          score={state.score}
          best={result.best}
          stars={result.stars}
          reward={result.reward}
          goals={game.goals}
          animate={!reduced}
          hasNext={!!next}
          onNext={() => {
            playJewel('click');
            navigate('jewelsPlay', { level: next!.id }, { replace: true });
          }}
          onRetry={() => {
            playJewel('click');
            onRetry();
          }}
          onLevels={() => navigate('jewels', { levels: true }, { replace: true })}
        />
      )}

      {JewelDevTools && (
        <Suspense fallback={null}>
          <JewelDevTools
            state={state}
            selected={game.selected}
            phase={game.phase}
            onSet={game.devSetState}
            onLevel={(d) => navigate('jewelsPlay', { level: Math.min(LEVELS.length, Math.max(1, level.id + d)) }, { replace: true })}
          />
        </Suspense>
      )}
    </>
  );
}
