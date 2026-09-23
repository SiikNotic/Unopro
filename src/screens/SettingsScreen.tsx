import { useState } from 'react';
import { Volume2, Smartphone, Sparkles, Info, Trash2, Check } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Toggle } from '@/components/ui/Toggle';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { storage } from '@/storage';
import type { LucideIcon } from 'lucide-react';

interface SettingRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon: Icon, title, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-ink-700/50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-ink-400" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-white text-sm">{title}</p>
          <p className="text-xs text-ink-500 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function SettingsScreen() {
  const { t } = useI18n();
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [animations, setAnimations] = useState(true);
  const [resetDone, setResetDone] = useState(false);

  const handleReset = () => {
    if (window.confirm(t('settings.resetDataConfirm'))) {
      storage.clear();
      setResetDone(true);
      setTimeout(() => setResetDone(false), 2500);
    }
  };

  return (
    <ScreenContainer title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <div className="flex flex-col gap-4">
        <section className="card-surface px-5 divide-y divide-white/5 animate-slide-up">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-ink-700/50 flex items-center justify-center">
                <span className="text-sm font-bold text-ink-400">EN/ES</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-white text-sm">{t('settings.language')}</p>
                <p className="text-xs text-ink-500 mt-0.5">{t('settings.languageDescription')}</p>
              </div>
            </div>
          </div>
          <div className="pb-4">
            <LanguageSelector />
          </div>
        </section>

        <section className="card-surface px-5 divide-y divide-white/5 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <SettingRow icon={Volume2} title={t('settings.sound')} description={t('settings.soundDescription')}>
            <Toggle checked={sound} onChange={setSound} label={t('settings.sound')} />
          </SettingRow>
          <SettingRow icon={Smartphone} title={t('settings.haptics')} description={t('settings.hapticsDescription')}>
            <Toggle checked={haptics} onChange={setHaptics} label={t('settings.haptics')} />
          </SettingRow>
          <SettingRow icon={Sparkles} title={t('settings.animations')} description={t('settings.animationsDescription')}>
            <Toggle checked={animations} onChange={setAnimations} label={t('settings.animations')} />
          </SettingRow>
        </section>

        <section className="card-surface px-5 py-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-ink-700/50 flex items-center justify-center">
              <Info className="w-5 h-5 text-ink-400" />
            </div>
            <div>
              <p className="font-medium text-white text-sm">{t('settings.about')}</p>
              <p className="text-xs text-ink-500 mt-0.5">{t('settings.aboutDescription')}</p>
            </div>
          </div>
          <div className="flex items-center justify-between pl-13">
            <span className="text-sm text-ink-400">{t('settings.version')}</span>
            <span className="text-sm text-white font-mono">0.1.0</span>
          </div>
        </section>

        <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <Button variant="danger" fullWidth icon={<Trash2 className="w-4 h-4" />} onClick={handleReset}>
            {t('settings.resetData')}
          </Button>
          {resetDone && (
            <p className="flex items-center justify-center gap-1.5 mt-3 text-sm text-success-500 animate-fade-in">
              <Check className="w-4 h-4" />
              {t('settings.resetDone')}
            </p>
          )}
        </div>
      </div>
    </ScreenContainer>
  );
}
