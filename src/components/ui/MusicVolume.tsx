import { Volume1, VolumeX } from 'lucide-react';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';

/** Music volume slider. Disabled (but visible) while music or sound is off. */
export function MusicVolume({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { preferences, setPreference } = usePreferences();
  const active = preferences.sound && preferences.music;
  const percent = Math.round(preferences.musicVolume * 100);
  return (
    <div className={`flex items-center gap-2.5 ${active ? '' : 'opacity-45'} ${className}`}>
      <VolumeX className="w-4 h-4 text-ink-400 shrink-0" aria-hidden />
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        disabled={!active}
        onChange={(e) => setPreference('musicVolume', Number(e.target.value) / 100)}
        className="music-slider flex-1 min-w-0"
        style={{ '--val': `${percent}%` } as React.CSSProperties}
        aria-label={t('settings.musicVolume')}
        aria-valuetext={`${percent}%`}
      />
      <Volume1 className="w-4 h-4 text-ink-400 shrink-0" aria-hidden />
      <span className="w-9 text-right text-xs font-bold tabular-nums text-white/80">{percent}%</span>
    </div>
  );
}
