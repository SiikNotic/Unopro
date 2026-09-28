import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Feather, Flame, Globe, Music, ShieldCheck, Shuffle, Smartphone, Sparkles, Target, Trash2, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { Toggle } from '@/components/ui/Toggle';
import { MusicVolume } from '@/components/ui/MusicVolume';
import { useI18n } from '@/i18n';
import { LANGUAGES } from '@/i18n/config';
import { storage } from '@/storage';
import { usePreferences } from '@/settings/usePreferences';
import { DIFFICULTY_OPTIONS } from '@/settings/preferences';
import type { ScenarioChoice } from '@/settings/preferences';
import { SCENARIO_IDS, SCENARIOS } from '@/game/scenarios/scenarios';
import { SCENARIO_ART } from '@/components/scene/art';
import { playSfx } from '@/audio/sfx';
import { WALLET_RESET_EVENT } from '@/casino/walletContext';
import { LuxIcon, LuxPage, LuxSection } from './lux/LuxPage';
import { LUX_ART } from './lux/art';
import { LEGAL_CONFIG } from '@/legal/config';

const LEVEL_ICON: LucideIcon[] = [Feather, Target, Flame];

function Row({ icon, title, description, control }: { icon: LucideIcon; title: string; description: string; control?: React.ReactNode }) {
  return (
    <div className="lx-row">
      <LuxIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <p className="lx-row-title">{title}</p>
        <p className="lx-row-text">{description}</p>
      </div>
      {control}
    </div>
  );
}

/** The chosen scenario, big, with arrows; the strip of small ones below. "Random" is one of the choices. */
function ScenarioPicker({ value, onChange }: { value: ScenarioChoice; onChange: (s: ScenarioChoice) => void }) {
  const { t } = useI18n();
  const choices: ScenarioChoice[] = ['random', ...SCENARIO_IDS];
  const index = Math.max(0, choices.indexOf(value));
  const step = (d: number) => onChange(choices[(index + d + choices.length) % choices.length]);
  const name = (id: ScenarioChoice) => (id === 'random' ? t('scenarios.random') : t(SCENARIOS[id].nameKey));
  const image = (id: ScenarioChoice) => (id === 'random' ? LUX_ART.randomScenario : SCENARIO_ART[id]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  };
  const current = choices[index];
  const art = image(current);
  return (
    <div className="lx-scn">
      <div className="lx-scn-stage">
        {art ? <img key={current} src={art} alt="" className="lx-scn-art" /> : <span className="lx-scn-random" aria-hidden />}
        {current === 'random' && !art && <Shuffle className="lx-scn-random-icon" aria-hidden />}
        <div className="lx-scn-caption">
          <b>{name(current)}</b>
          {current === 'random' && <span>{t('settings.scenarioDescription')}</span>}
        </div>
        <button type="button" className="lx-scn-arrow is-prev" onClick={() => step(-1)} aria-label={t('settings.scenarioPrev')}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button type="button" className="lx-scn-arrow is-next" onClick={() => step(1)} aria-label={t('settings.scenarioNext')}>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div role="radiogroup" aria-label={t('settings.scenario')} className="lx-scn-strip" onKeyDown={onKey}>
        {choices.map((id) => {
          const selected = id === current;
          const thumb = image(id);
          return (
            <button key={id} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} className={`lx-thumb ${selected ? 'is-on' : ''}`} onClick={() => onChange(id)}>
              <span className="lx-thumb-img" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
                {id === 'random' && !thumb && <Shuffle className="w-4 h-4" aria-hidden />}
              </span>
              <span className="lx-thumb-name">{name(id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const { navigate } = useNavigation();
  const { t, language, setLanguage } = useI18n();
  const { preferences, setPreference } = usePreferences();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const handleReset = () => {
    storage.clear();
    try {
      sessionStorage.clear();
    } catch {
      // unavailable
    }
    window.dispatchEvent(new Event(WALLET_RESET_EVENT));
    setConfirmReset(false);
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 2500);
  };

  return (
    <LuxPage title={t('settings.title')} subtitle={t('settings.subtitle')} art={LUX_ART.settingsBg}>
      <LuxSection title={t('settings.difficulty')} id="lx-difficulty">
        <div role="radiogroup" aria-labelledby="lx-difficulty" className="lx-levels">
          {DIFFICULTY_OPTIONS.map((level, i) => {
            const selected = preferences.difficulty === level;
            const Icon = LEVEL_ICON[i] ?? Target;
            return (
              <button key={level} type="button" role="radio" aria-checked={selected} onClick={() => setPreference('difficulty', level)} className={`lx-level ${selected ? 'is-on' : ''}`}>
                {selected && (
                  <span className="lx-level-check" aria-hidden>
                    <Check className="w-3 h-3" strokeWidth={3.5} />
                  </span>
                )}
                <Icon className="lx-level-icon" aria-hidden />
                <span className="lx-level-name">{t(`settings.levels.${level}.name`)}</span>
                <span className="lx-level-text">{t(`settings.levels.${level}.description`)}</span>
              </button>
            );
          })}
        </div>
      </LuxSection>

      <LuxSection title={t('settings.scenario')} hint={t('settings.scenarioHint')} id="lx-scenario">
        <ScenarioPicker value={preferences.scenario} onChange={(s) => setPreference('scenario', s)} />
      </LuxSection>

      <LuxSection title={t('settings.gameFeel')} id="lx-feel">
        <div className="lx-card lx-rows">
          <Row
            icon={Volume2}
            title={t('settings.sound')}
            description={t('settings.soundDescription')}
            control={
              <Toggle
                checked={preferences.sound}
                onChange={(v) => {
                  setPreference('sound', v);
                  if (v) window.setTimeout(() => playSfx('colorPick'), 50);
                }}
                label={t('settings.sound')}
              />
            }
          />
          <Row
            icon={Music}
            title={t('settings.music')}
            description={preferences.sound ? t('settings.musicDescription') : t('settings.musicNeedsSound')}
            control={<Toggle checked={preferences.music} onChange={(v) => setPreference('music', v)} label={t('settings.music')} />}
          />
          <div className="lx-row lx-row-volume">
            <span className="lx-row-title">{t('settings.volume')}</span>
            <MusicVolume className="flex-1 min-w-0" />
          </div>
          <Row
            icon={Smartphone}
            title={t('settings.haptics')}
            description={t('settings.hapticsDescription')}
            control={
              <Toggle
                checked={preferences.haptics}
                onChange={(v) => {
                  setPreference('haptics', v);
                  if (v) {
                    try {
                      navigator.vibrate?.(30);
                    } catch {
                      // optional
                    }
                  }
                }}
                label={t('settings.haptics')}
              />
            }
          />
          <Row
            icon={Sparkles}
            title={t('settings.animations')}
            description={t('settings.animationsDescription')}
            control={<Toggle checked={preferences.animations} onChange={(v) => setPreference('animations', v)} label={t('settings.animations')} />}
          />
        </div>
      </LuxSection>

      <div className="lx-duo">
        <div className="lx-card lx-mini">
          <div className="lx-mini-head">
            <LuxIcon icon={Globe} />
            <p className="lx-row-title">{t('settings.language')}</p>
          </div>
          <div className="lx-seg" role="radiogroup" aria-label={t('settings.language')}>
            {[...LANGUAGES]
              .sort((a, b) => (a.code === 'es' ? -1 : b.code === 'es' ? 1 : 0))
              .map((lang) => (
                <button key={lang.code} type="button" role="radio" aria-checked={language === lang.code} onClick={() => setLanguage(lang.code)}>
                  {lang.label}
                </button>
              ))}
          </div>
        </div>
        <button type="button" className="lx-card lx-mini lx-link" onClick={() => navigate('legal')}>
          <div className="lx-mini-head">
            <LuxIcon icon={ShieldCheck} />
            <p className="lx-row-title">{t('legal.title')}</p>
            <ChevronRight className="w-5 h-5 ml-auto text-white/45 shrink-0" aria-hidden />
          </div>
          <p className="lx-row-text">{t('settings.legalHint')}</p>
        </button>
      </div>

      <div className="lx-foot">
        <p className="lx-version">
          {t('settings.version')} <span>0.2.0</span>
        </p>
        {LEGAL_CONFIG.owner && (
          <p className="lx-version">
            {t('settings.madeBy', { company: LEGAL_CONFIG.owner })}
            {LEGAL_CONFIG.contactEmail && (
              <>
                {' · '}
                <a href={`mailto:${LEGAL_CONFIG.contactEmail}`} className="underline underline-offset-2">
                  {LEGAL_CONFIG.contactEmail}
                </a>
              </>
            )}
          </p>
        )}
        {confirmReset ? (
          <div className="lx-danger-box" role="alertdialog" aria-label={t('settings.resetData')}>
            <p>{t('settings.resetDataConfirm')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="lx-btn lx-btn-ghost" onClick={() => setConfirmReset(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="lx-btn lx-btn-danger" onClick={handleReset}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="lx-btn lx-btn-danger-soft" onClick={() => setConfirmReset(true)}>
            <Trash2 className="w-4 h-4" aria-hidden /> {t('settings.resetData')}
          </button>
        )}
        {resetDone && (
          <p className="lx-ok" role="status">
            <Check className="w-4 h-4" aria-hidden /> {t('settings.resetDone')}
          </p>
        )}
      </div>
    </LuxPage>
  );
}
