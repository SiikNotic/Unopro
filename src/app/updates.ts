// In-app updates for the Android app (outside Google Play): the latest GitHub Release publishes
// update.json + the signed APK; the native AppUpdater plugin downloads it, checks its SHA-256 and opens
// Android's installer (Android also checks the signature and asks the player to confirm).
import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface UpdateManifest {
  versionCode: number;
  versionName: string;
  notes: { es: string[]; en: string[] };
  apkUrl: string;
  sha256: string;
}

interface AppUpdaterPlugin {
  current(): Promise<{ versionCode: number; versionName: string }>;
  check(): Promise<{ manifest?: string }>;
  downloadAndInstall(options: { url: string; sha256: string }): Promise<void>;
  addListener(event: 'progress', fn: (e: { percent: number }) => void): Promise<PluginListenerHandle>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

const RELEASES = 'https://github.com/SiikNotic/Unopro/releases/download/';

/** "1.2.3" → 10203 (the Android versionCode the release workflow uses). */
export function versionCodeOf(version: string): number | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(version.trim());
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, 12).map((s) => s.slice(0, 300)) : []);

/** Validates update.json; anything unexpected (other host, bad hash, bad version) is ignored. */
export function parseManifest(text: string | undefined): UpdateManifest | null {
  if (!text) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const versionName = typeof raw.versionName === 'string' ? raw.versionName : '';
  const versionCode = Number(raw.versionCode);
  const apkUrl = typeof raw.apkUrl === 'string' ? raw.apkUrl : '';
  const sha256 = typeof raw.sha256 === 'string' ? raw.sha256 : '';
  if (versionCodeOf(versionName) !== versionCode) return null;
  if (!apkUrl.startsWith(RELEASES) || !apkUrl.endsWith('.apk') || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  const notes = (raw.notes ?? {}) as { es?: unknown; en?: unknown };
  return { versionCode, versionName, apkUrl, sha256, notes: { es: strings(notes.es), en: strings(notes.en) } };
}

export const isNewer = (manifest: UpdateManifest | null, currentCode: number): manifest is UpdateManifest => !!manifest && manifest.versionCode > currentCode;

/** Notes in the player's language, falling back to the other one. */
export const notesFor = (notes: { es: string[]; en: string[] }, language: string): string[] => (language === 'en' ? notes.en.length ? notes.en : notes.es : notes.es.length ? notes.es : notes.en);
