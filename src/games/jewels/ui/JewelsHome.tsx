// Jewellery's front door (single-player: no setup screen). Play continues where you left off; Levels shows
// the map; the gear holds sound, music and animations (the app's own preferences).
import { useState } from 'react';
import { ArrowLeft, Lock, Play, Settings2, Star, X } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';
import { Toggle } from '@/components/ui/Toggle';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { LEVELS } from '../engine';
import { localProgress } from '../progress';
import { JewelDefs } from './JewelDefs';
import './jewels.css';

export function JewelsHome() {
  const { t } = useI18n();
  const { navigate, back, params } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const [progress] = useState(() => localProgress.load());
  const [view, setView] = useState<'home' | 'levels'>(params.levels ? 'levels' : 'home');
  const [settings, setSettings] = useState(false);
  useGameMusic('jewels');
  const play = (level: number) => navigate('jewelsPlay', { level });
  const totalStars = Object.values(progress.best).reduce((s, b) => s + b.stars, 0);

  return (
    <div className="jws jws-home">
      <JewelDefs />
      <header className="jws-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => (view === 'levels' ? setView('home') : back('home'))} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="flex-1" />
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setSettings(true)} aria-label={t('jewels.settings')}>
          <Settings2 className="w-5 h-5" />
        </button>
      </header>

      {view === 'home' ? (
        <main className="jws-hero">
          <div className="jws-crown" aria-hidden>
            {[2, 0, 3, 1, 4].map((k, i) => (
              <svg key={k} viewBox="0 0 100 100" className={`jws-float jws-float-${i}`}>
                <use href={`#jw${k}`} />
              </svg>
            ))}
          </div>
          <h1 className="jws-title">Jewellery</h1>
          <p className="jws-tagline">{t('jewels.tagline')}</p>
          <div className="jws-home-actions">
            <button type="button" className="jws-cta" onClick={() => play(progress.current)}>
              <Play className="w-5 h-5" fill="currentColor" aria-hidden /> {t('jewels.play')}
              <small>{t('jewels.levelN', { n: progress.current })}</small>
            </button>
            <button type="button" className="jws-ghost" onClick={() => setView('levels')}>
              {t('jewels.levels')}
              <small>
                <Star className="w-3.5 h-3.5 inline -mt-0.5" aria-hidden /> {totalStars}/{LEVELS.length * 3}
              </small>
            </button>
          </div>
        </main>
      ) : (
        <main className="jws-levels">
          <h1 className="jws-levels-title">{t('jewels.levels')}</h1>
          <ol className="jws-grid">
            {LEVELS.map((l) => {
              const locked = l.id > progress.unlocked;
              const best = progress.best[l.id];
              return (
                <li key={l.id}>
                  <button type="button" className={`jws-tile ${locked ? 'is-locked' : ''} ${l.id === progress.current ? 'is-current' : ''}`} disabled={locked} onClick={() => play(l.id)} aria-label={locked ? t('jewels.lockedAria', { n: l.id }) : t('jewels.levelAria', { n: l.id, stars: best?.stars ?? 0 })}>
                    {locked ? <Lock className="w-5 h-5" aria-hidden /> : <b>{l.id}</b>}
                    <span className="jws-tile-stars" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <Star key={i} className={i < (best?.stars ?? 0) ? 'is-on' : ''} />
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="jws-note">{t('jewels.moreSoon')}</p>
        </main>
      )}

      {settings && (
        <div className="jws-modal" role="dialog" aria-modal="true" aria-labelledby="jws-settings" onClick={(e) => e.target === e.currentTarget && setSettings(false)}>
          <div className="jws-card jws-settings">
            <div className="flex items-center gap-2 mb-2">
              <h2 id="jws-settings" className="jws-card-title flex-1 !text-left !text-xl">
                {t('jewels.settings')}
              </h2>
              <button type="button" className="cz-btn cz-btn-quiet cz-icon-btn" onClick={() => setSettings(false)} aria-label={t('common.close')}>
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
              <div key={key} className="jws-setting">
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
