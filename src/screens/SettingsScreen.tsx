import { useState } from 'react';
import { Volume2, Smartphone, Sparkles, Info, Trash2, Check, Shuffle, Gauge, Mountain, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Toggle } from '@/components/ui/Toggle';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { storage } from '@/storage';
import { usePreferences } from '@/settings/usePreferences';
import { DIFFICULTY_OPTIONS } from '@/settings/preferences';
import type { ScenarioChoice } from '@/settings/preferences';
import { SCENARIO_IDS, SCENARIOS } from '@/game/scenarios/scenarios';
import { playSfx } from '@/audio/sfx';

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <h2 className="flex items-center gap-2 px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {children}
    </h2>
  );
}

function SettingRow({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-b from-ink-700 to-ink-800 border border-white/5 flex items-center justify-center">
        <Icon className="w-5 h-5 text-gold-400" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white text-sm">{title}</p>
        <p className="text-xs text-ink-400 mt-0.5 leading-snug">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Difficulty pips: 1–3 filled bars. */
function Pips({ level }: { level: number }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-1.5 rounded-sm ${i <= level ? 'bg-gold-400' : 'bg-white/15'}`} style={{ height: 6 + i * 4 }} />
      ))}
    </span>
  );
}

export function SettingsScreen() {
  const { t } = useI18n();
  const { preferences, setPreference } = usePreferences();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const handleReset = () => {
    storage.clear();
    setConfirmReset(false);
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 2500);
  };

  const scenarioChoices: ScenarioChoice[] = ['random', ...SCENARIO_IDS];

  return (
    <ScreenContainer title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <div className="flex flex-col gap-6">
        {/* Difficulty */}
        <section className="animate-slide-up">
          <SectionTitle icon={Gauge}>{t('settings.difficulty')}</SectionTitle>
          <div role="radiogroup" aria-label={t('settings.difficulty')} className="grid grid-cols-3 gap-2 sm:gap-3">
            {DIFFICULTY_OPTIONS.map((level, i) => {
              const selected = preferences.difficulty === level;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPreference('difficulty', level)}
                  className={`choice rounded-2xl px-2 py-3 sm:px-3 sm:py-4 flex flex-col items-center text-center gap-1.5 min-w-0 ${selected ? 'choice-selected' : ''}`}
                >
                  {selected && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gold-400 text-ink-950 flex items-center justify-center shadow">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </span>
                  )}
                  <Pips level={i + 1} />
                  <span className={`font-display font-extrabold text-sm sm:text-base ${selected ? 'text-gold-400' : 'text-white'}`}>{t(`settings.levels.${level}.name`)}</span>
                  <span className="text-[11px] sm:text-xs text-ink-400 leading-snug">{t(`settings.levels.${level}.description`)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Scenario */}
        <section className="animate-slide-up" style={{ animationDelay: '0.04s' }}>
          <SectionTitle icon={Mountain}>{t('settings.scenario')}</SectionTitle>
          <div role="radiogroup" aria-label={t('settings.scenario')} className="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2">
            {scenarioChoices.map((id) => {
              const selected = preferences.scenario === id;
              const palette = id === 'random' ? null : SCENARIOS[id].palette;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPreference('scenario', id)}
                  className={`choice rounded-xl p-1.5 flex flex-col gap-1.5 min-w-0 ${selected ? 'choice-selected' : ''}`}
                >
                  <span
                    className={`scenario-thumb scenario-thumb-${id} h-12 rounded-lg flex items-center justify-center`}
                    style={palette ? ({ '--thumb-felt': palette.felt, '--thumb-rim': palette.rim } as React.CSSProperties) : undefined}
                  >
                    {id === 'random' && <Shuffle className="w-5 h-5 text-white" aria-hidden />}
                  </span>
                  <span className={`text-xs font-semibold truncate ${selected ? 'text-gold-400' : 'text-white'}`}>
                    {id === 'random' ? t('scenarios.random') : t(SCENARIOS[id].nameKey)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-xs text-ink-400">{t('settings.scenarioDescription')}</p>
        </section>

        {/* Game feel */}
        <section className="animate-slide-up" style={{ animationDelay: '0.08s' }}>
          <SectionTitle icon={Sparkles}>{t('settings.gameFeel')}</SectionTitle>
          <div className="menu-panel rounded-2xl px-4 divide-y divide-white/5">
            <SettingRow icon={Volume2} title={t('settings.sound')} description={t('settings.soundDescription')}>
              <Toggle
                checked={preferences.sound}
                onChange={(v) => {
                  setPreference('sound', v);
                  if (v) window.setTimeout(() => playSfx('colorPick'), 50);
                }}
                label={t('settings.sound')}
              />
            </SettingRow>
            <SettingRow icon={Smartphone} title={t('settings.haptics')} description={t('settings.hapticsDescription')}>
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
            </SettingRow>
            <SettingRow icon={Sparkles} title={t('settings.animations')} description={t('settings.animationsDescription')}>
              <Toggle checked={preferences.animations} onChange={(v) => setPreference('animations', v)} label={t('settings.animations')} />
            </SettingRow>
          </div>
        </section>

        {/* Language */}
        <section className="animate-slide-up" style={{ animationDelay: '0.12s' }}>
          <SectionTitle icon={Globe}>{t('settings.language')}</SectionTitle>
          <div className="menu-panel rounded-2xl p-4">
            <LanguageSelector />
          </div>
        </section>

        {/* About + reset */}
        <section className="animate-slide-up" style={{ animationDelay: '0.16s' }}>
          <SectionTitle icon={Info}>{t('settings.about')}</SectionTitle>
          <div className="menu-panel rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-400">{t('settings.version')}</span>
              <span className="text-white font-mono">0.2.0</span>
            </div>
            {confirmReset ? (
              <div className="flex flex-col gap-3" role="alertdialog" aria-label={t('settings.resetData')}>
                <p className="text-sm text-ink-300">{t('settings.resetDataConfirm')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirmReset(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleReset}>
                    {t('common.confirm')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" size="sm" fullWidth icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmReset(true)}>
                {t('settings.resetData')}
              </Button>
            )}
            {resetDone && (
              <p className="flex items-center gap-1.5 text-sm text-success-500 animate-fade-in" role="status">
                <Check className="w-4 h-4" />
                {t('settings.resetDone')}
              </p>
            )}
          </div>
        </section>
      </div>
    </ScreenContainer>
  );
}
