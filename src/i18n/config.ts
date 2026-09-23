export type LanguageCode = 'en' | 'es';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'es', label: 'Español', flag: 'ES' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';
