// What each version brings, one entry per version (changelog.json at the repository root). The release
// workflow publishes a version's own entry in its update.json; the app shows the entry of the version being
// installed (from update.json) or just installed (from the bundled file) — never older versions' news.
import changelog from '../../changelog.json';

/** The icons an item can use (anything else falls back to "new"). */
export const CHANGE_ICONS = ['new', 'update', 'game', 'design', 'fix', 'speed', 'coins', 'security', 'sound', 'star'] as const;
export type ChangeIcon = (typeof CHANGE_ICONS)[number];

/** At most this many items are shown for one version. */
export const MAX_ITEMS = 5;

export interface ChangeItem {
  icon: ChangeIcon;
  text: string;
}

/** Release notes as published in update.json: texts per language, plus one icon per item. */
export interface ReleaseNotes {
  es: string[];
  en: string[];
  icons?: ChangeIcon[];
}

export const toIcon = (x: unknown): ChangeIcon => (CHANGE_ICONS.includes(x as ChangeIcon) ? (x as ChangeIcon) : 'new');

interface Entry {
  icon?: string;
  es?: string;
  en?: string;
}

/** A version's entry in the bundled changelog, as release notes (empty when the version has none). */
export function notesOfVersion(version: string, source: { versions?: Record<string, Entry[]> } = changelog): ReleaseNotes {
  const entry = source.versions?.[version];
  const items = Array.isArray(entry) ? entry.filter((e) => e && (typeof e.es === 'string' || typeof e.en === 'string')).slice(0, MAX_ITEMS) : [];
  return {
    es: items.map((e) => e.es ?? e.en ?? ''),
    en: items.map((e) => e.en ?? e.es ?? ''),
    icons: items.map((e) => toIcon(e.icon)),
  };
}

/** The items to show, in the player's language (falling back to the other one), at most MAX_ITEMS. */
export function itemsFor(notes: ReleaseNotes, language: string): ChangeItem[] {
  const texts = language === 'en' ? (notes.en.length ? notes.en : notes.es) : notes.es.length ? notes.es : notes.en;
  return texts
    .filter((s) => s.trim())
    .slice(0, MAX_ITEMS)
    .map((text, i) => ({ icon: toIcon(notes.icons?.[i]), text }));
}
