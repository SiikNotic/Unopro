import { Globe, Check } from 'lucide-react';
import { LANGUAGES } from '@/i18n/config';
import { useI18n } from '@/i18n';
import type { LanguageCode } from '@/i18n/config';

interface LanguageSelectorProps {
  compact?: boolean;
  /** Show the short code (EN/ES) instead of the language name — for tight headers. */
  short?: boolean;
}

export function LanguageSelector({ compact = false, short = false }: LanguageSelectorProps) {
  const { language, setLanguage } = useI18n();

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-ink-400" />
        <select
          aria-label={LANGUAGES.find((l) => l.code === language)?.label}
          value={language}
          onChange={(e) => setLanguage(e.target.value as LanguageCode)}
          className="bg-transparent text-sm text-white border-none outline-none cursor-pointer"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-ink-800">
              {short ? lang.flag : lang.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {LANGUAGES.map((lang) => {
        const active = language === lang.code;
        return (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all duration-200 ${
              active
                ? 'bg-brand-500/15 border-brand-400/40 text-white'
                : 'bg-ink-800/40 border-white/10 text-ink-400 hover:text-white hover:border-white/20'
            }`}
          >
            <span className="font-medium">{lang.label}</span>
            {active && <Check className="w-4 h-4 text-brand-400" />}
          </button>
        );
      })}
    </div>
  );
}
