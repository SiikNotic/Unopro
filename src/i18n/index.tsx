import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_LANGUAGE, type LanguageCode } from './config';
import { storage } from '@/storage';
import en from './locales/en.json';
import es from './locales/es.json';

type TranslationDict = Record<string, unknown>;

const translations: Record<LanguageCode, TranslationDict> = {
  en: en as TranslationDict,
  es: es as TranslationDict,
};

const STORAGE_KEY = 'carta.language';

function resolveKey(dict: TranslationDict, key: string): string {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const stored = storage.get<LanguageCode>(STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
    return DEFAULT_LANGUAGE;
  });

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    storage.set(STORAGE_KEY, lang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const template = resolveKey(translations[language], key);
      return interpolate(template, vars);
    },
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
