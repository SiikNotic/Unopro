// The web app finds out when a newer build is published. Every build writes version.json next to index.html
// with the file name of its main script (content-hashed, so it only changes when the app changes) and the
// news of its newest changelog entry. A page that was opened before the new build compares that name with the
// script it is running and offers to reload. The Android app carries its files inside and never checks this.
import { MAX_ITEMS, toIcon } from './changelog';
import type { ReleaseNotes } from './changelog';

export interface WebVersion {
  /** Main script of the published build, e.g. "assets/index-a1b2c3.js". */
  entry: string;
  /** Its newest changelog version ("1.3.1"), shown in the title. */
  version: string;
  notes: ReleaseNotes;
}

const ENTRY_RE = /^assets\/[\w.-]{1,80}\.js$/;
const VERSION_RE = /^\d{1,2}\.\d{1,2}\.\d{1,2}$/;
const texts = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, MAX_ITEMS).map((s) => s.slice(0, 300)) : []);

/** Validates version.json; anything unexpected is ignored (null). */
export function parseWebVersion(raw: unknown): WebVersion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.entry !== 'string' || !ENTRY_RE.test(r.entry)) return null;
  const version = typeof r.version === 'string' && VERSION_RE.test(r.version) ? r.version : '';
  const n = (r.notes ?? {}) as Record<string, unknown>;
  const icons = Array.isArray(n.icons) ? n.icons.slice(0, MAX_ITEMS).map(toIcon) : [];
  return { entry: r.entry, version, notes: { es: texts(n.es), en: texts(n.en), icons } };
}

/** The main script this page is running ("assets/index-….js"), or null in development. */
export function runningEntry(doc: Pick<Document, 'querySelectorAll'> = document): string | null {
  for (const s of Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const m = /(?:^|\/)(assets\/[\w.-]{1,80}\.js)(?:[?#].*)?$/.exec(s.getAttribute('src') ?? '');
    if (m) return m[1];
  }
  return null;
}
