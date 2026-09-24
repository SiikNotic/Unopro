import { Music, Music2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/settings/usePreferences';

/** Quick on/off for the background music, shown in headers so it's never more than one tap away. */
export function MusicButton({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { preferences, setPreference } = usePreferences();
  const on = preferences.music && preferences.sound;
  return (
    <button
      type="button"
      onClick={() => {
        if (!preferences.sound) {
          setPreference('sound', true);
          setPreference('music', true);
        } else setPreference('music', !preferences.music);
      }}
      aria-pressed={on}
      aria-label={on ? t('settings.musicOff') : t('settings.musicOn')}
      title={on ? t('settings.musicOff') : t('settings.musicOn')}
      className={`btn-game btn-secondary shrink-0 w-11 h-11 rounded-xl flex items-center justify-center relative ${className}`}
    >
      {on ? <Music className="w-5 h-5" /> : <Music2 className="w-5 h-5 opacity-50" />}
      {!on && <span className="absolute w-6 h-0.5 bg-current rotate-45 rounded-full opacity-80" aria-hidden />}
    </button>
  );
}
