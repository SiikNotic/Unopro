// Jewellery: Olympus front door (single-player: no setup screen). The title with Play (continues where you
// left off), the level map (an ascent to Olympus: medallions on a winding path, a temple every five
// levels, chapters) and the settings (the app's sound, music and animation preferences).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Lock, Map as MapIcon, Play, Settings2, X } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { Toggle } from '@/components/ui/Toggle';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { BOOSTERS, LEVELS } from '../engine';
import { localProgress } from '../progress';
import type { JewelProgress } from '../progress';
import { JewelDefs } from './JewelDefs';
import { OlympusScene } from './OlympusScene';
import { BoosterIcon, Laurel, StarIcon } from './OlympusArt';
import { playJewel } from './jewelAudio';
import './jewels.css';

const STEP = 104; // vertical distance between levels on the map (px)

function LevelMap({ progress, onPlay }: { progress: JewelProgress; onPlay: (id: number) => void }) {
  const { t } = useI18n();
  const current = useRef<HTMLButtonElement>(null);
  const n = LEVELS.length;
  const height = n * STEP + 140;
  // Level 1 at the bottom, climbing to the throne at the top.
  const nodes = useMemo(() => LEVELS.map((l, i) => ({ l, x: 50 + Math.sin(i * 0.85) * 26, y: height - 90 - i * STEP })), [height]);
  const path = useMemo(() => {
    const pts = nodes.map((p) => [p.x, p.y]);
    return pts.map(([x, y], i) => (i === 0 ? `M${x} ${y}` : `S${(x + pts[i - 1][0]) / 2} ${y + STEP / 2} ${x} ${y}`)).join(' ');
  }, [nodes]);
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <div className="ol-map" style={{ height } as CSSProperties}>
      <svg className="ol-map-path" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
        <path d={path} fill="none" stroke="#fff4d6" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="1.5 2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {[0, 1, 2, 3].map((ch) => (
        <p key={ch} className="ol-chapter" style={{ top: nodes[ch * 5].y + 58 } as CSSProperties}>
          <span>{t(`jewels.chapter.${ch}`)}</span>
        </p>
      ))}
      <ol>
        {nodes.map(({ l, x, y }) => {
          const locked = l.id > progress.unlocked;
          const best = progress.best[l.id];
          const isCurrent = l.id === progress.current;
          const temple = l.id % 5 === 0;
          return (
            <li key={l.id} style={{ left: `${x}%`, top: y } as CSSProperties}>
              <button
                ref={isCurrent ? current : undefined}
                type="button"
                className={`ol-node${locked ? ' is-locked' : ''}${isCurrent ? ' is-current' : ''}${best ? ' is-done' : ''}${temple ? ' is-temple' : ''}`}
                disabled={locked}
                onClick={() => onPlay(l.id)}
                aria-label={locked ? t('jewels.lockedAria', { n: l.id }) : t('jewels.levelAria', { n: l.id, stars: best?.stars ?? 0 })}
              >
                {temple && (
                  <svg className="ol-node-temple" viewBox="0 0 100 100" aria-hidden>
                    <use href="#jw-temple" />
                  </svg>
                )}
                {locked ? <Lock className="w-5 h-5" aria-hidden /> : <b>{l.id}</b>}
              </button>
              {!locked && (
                <span className="ol-node-stars" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <StarIcon key={i} on={i < (best?.stars ?? 0)} />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function JewelsHome() {
  const { t } = useI18n();
  const { navigate, back, params } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const [progress] = useState(() => localProgress.load());
  const [view, setView] = useState<'home' | 'levels'>(params.levels ? 'levels' : 'home');
  const [settings, setSettings] = useState(false);
  useGameMusic('jewels');
  const play = (level: number) => {
    playJewel('click');
    navigate('jewelsPlay', { level });
  };
  const totalStars = Object.values(progress.best).reduce((s, b) => s + b.stars, 0);

  return (
    <div className={`ol ol-home ${view === 'levels' ? 'is-map' : ''}`}>
      <JewelDefs />
      <OlympusScene />
      <header className="ol-top">
        <button type="button" className="ol-icon-btn" onClick={() => (view === 'levels' ? setView('home') : back('home'))} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="ol-level-plaque">
          <StarIcon on className="w-4 h-4 inline-block" />
          <b>
            {totalStars}/{LEVELS.length * 3}
          </b>
        </p>
        <button type="button" className="ol-icon-btn" onClick={() => setSettings(true)} aria-label={t('jewels.settings')}>
          <Settings2 className="w-5 h-5" />
        </button>
      </header>

      {view === 'home' ? (
        <main className="ol-hero">
          <div className="ol-crown" aria-hidden>
            {[2, 0, 3, 5, 4].map((k, i) => (
              <svg key={k} viewBox="0 0 100 100" className={`ol-float ol-float-${i}`}>
                <use href={`#jw${k}`} />
              </svg>
            ))}
          </div>
          <h1 className="ol-title">
            <span>Jewellery</span>
            <small>
              <Laurel className="ol-title-laurel" /> Olympus
            </small>
          </h1>
          <p className="ol-tagline">{t('jewels.tagline')}</p>
          <div className="ol-home-actions">
            <button type="button" className="ol-cta" onClick={() => play(progress.current)}>
              <Play className="w-5 h-5" fill="currentColor" aria-hidden /> {t('jewels.play')}
              <small>{t('jewels.levelN', { n: progress.current })}</small>
            </button>
            <button type="button" className="ol-ghost ol-ghost-lg" onClick={() => setView('levels')}>
              <MapIcon className="w-5 h-5" aria-hidden /> {t('jewels.levels')}
            </button>
          </div>
          <ul className="ol-inventory" aria-label={t('jewels.boosters')}>
            {BOOSTERS.map((b) => (
              <li key={b} title={t(`jewels.booster.${b}`)} aria-label={t('jewels.boosterAria', { name: t(`jewels.booster.${b}`), n: progress.boosters[b] })}>
                <span className="ol-inv-icon">
                  <BoosterIcon booster={b} />
                </span>
                <b>{progress.boosters[b]}</b>
              </li>
            ))}
          </ul>
          <p className="ol-note">{t('jewels.virtualNote')}</p>
        </main>
      ) : (
        <main className="ol-levels">
          <h1 className="ol-levels-title">{t('jewels.mapTitle')}</h1>
          <LevelMap progress={progress} onPlay={play} />
        </main>
      )}

      {settings && (
        <div className="ol-end" role="dialog" aria-modal="true" aria-labelledby="ol-settings" onClick={(e) => e.target === e.currentTarget && setSettings(false)}>
          <div className="ol-card ol-settings">
            <div className="flex items-center gap-2 mb-2">
              <h2 id="ol-settings" className="ol-card-title flex-1 !text-left !text-xl">
                {t('jewels.settings')}
              </h2>
              <button type="button" className="ol-icon-btn" onClick={() => setSettings(false)} aria-label={t('common.close')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {(
              [
                ['sound', t('jewels.sound')],
                ['music', t('jewels.music')],
                ['animations', t('jewels.animations')],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="ol-setting">
                <span>{label}</span>
                <Toggle checked={preferences[key]} onChange={(v) => setPreference(key, v)} label={label} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
