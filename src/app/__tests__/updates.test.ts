import { describe, expect, it, vi } from 'vitest';
import release from '../../../app-release.json';
import es from '@/i18n/locales/es.json';
import en from '@/i18n/locales/en.json';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
const { isNewer, notesFor, parseManifest, versionCodeOf } = await import('../updates');

const good = {
  versionCode: 10100,
  versionName: '1.1.0',
  notes: { es: ['Hola'], en: ['Hello'] },
  apkUrl: 'https://github.com/SiikNotic/Unopro/releases/download/v1.1.0/carta.apk',
  sha256: 'a'.repeat(64),
};

describe('in-app updates', () => {
  it('derives the Android versionCode from the version', () => {
    expect(versionCodeOf('1.1.0')).toBe(10100);
    expect(versionCodeOf('2.10.3')).toBe(21003);
    expect(versionCodeOf('1.1')).toBeNull();
    expect(versionCodeOf('v1.1.0')).toBeNull();
  });

  it('accepts only a well-formed manifest from this project releases', () => {
    expect(parseManifest(JSON.stringify(good))).toMatchObject({ versionCode: 10100, versionName: '1.1.0' });
    expect(parseManifest(JSON.stringify({ ...good, apkUrl: 'https://evil.example/carta.apk' }))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...good, apkUrl: 'https://github.com/Other/repo/releases/download/v1/carta.apk' }))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...good, sha256: 'xyz' }))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...good, versionCode: 99999 }))).toBeNull();
    expect(parseManifest('not json')).toBeNull();
    expect(parseManifest(undefined)).toBeNull();
  });

  it('offers only newer versions', () => {
    const m = parseManifest(JSON.stringify(good));
    expect(isNewer(m, 10000)).toBe(true);
    expect(isNewer(m, 10100)).toBe(false);
    expect(isNewer(m, 10200)).toBe(false);
    expect(isNewer(null, 1)).toBe(false);
  });

  it('shows notes in the player language', () => {
    expect(notesFor(good.notes, 'es')).toEqual(['Hola']);
    expect(notesFor(good.notes, 'en')).toEqual(['Hello']);
    expect(notesFor({ es: ['Solo'], en: [] }, 'en')).toEqual(['Solo']);
  });

  it('the release file is valid and translated', () => {
    expect(versionCodeOf(release.version)).not.toBeNull();
    expect(release.notes.es.length).toBeGreaterThan(0);
    expect(release.notes.en.length).toBe(release.notes.es.length);
    expect(Object.keys(es.update).sort()).toEqual(Object.keys(en.update).sort());
  });
});
