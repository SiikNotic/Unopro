// Local player profile (a display name only). Validated on the way in and out of storage.
import { useCallback, useState } from 'react';
import { storage } from '@/storage';

const KEY = 'carta.profile';
export const NAME_MAX = 20;

/** Trims, collapses spaces, drops control characters and caps the length. Empty means "no name". */
export function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const printable = [...raw].filter((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 32 && code !== 127 && ch !== '<' && ch !== '>';
  });
  return printable
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

export function useProfileName(): [string, (name: string) => void] {
  const [name, setName] = useState(() => normalizeName((storage.get<{ name?: unknown }>(KEY) ?? {}).name));
  const save = useCallback((value: string) => {
    const clean = normalizeName(value);
    setName(clean);
    storage.set(KEY, { name: clean });
  }, []);
  return [name, save];
}
