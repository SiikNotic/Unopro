import { describe, expect, it, vi } from 'vitest';
import release from '../../../app-release.json';
import changelog from '../../../changelog.json';
import es from '@/i18n/locales/es.json';
import en from '@/i18n/locales/en.json';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
const { isNewer, parseManifest, versionCodeOf } = await import('../updates');
const { CHANGE_ICONS, MAX_ITEMS, itemsFor, notesOfVersion } = await import('../changelog');

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

  it('reads the icons of a release when present, and old releases without them', () => {
    const m = parseManifest(JSON.stringify({ ...good, notes: { es: ['A', 'B'], en: ['A', 'B'], icons: ['game', 'nope'] } }));
    expect(m?.notes.icons).toEqual(['game', 'new']);
    expect(parseManifest(JSON.stringify(good))?.notes.icons).toBeUndefined();
  });

  it('shows the items in the player language, at most five, each with an icon', () => {
    expect(itemsFor(good.notes, 'es')).toEqual([{ icon: 'new', text: 'Hola' }]);
    expect(itemsFor(good.notes, 'en')).toEqual([{ icon: 'new', text: 'Hello' }]);
    expect(itemsFor({ es: ['Solo'], en: [] }, 'en')).toEqual([{ icon: 'new', text: 'Solo' }]);
    const many = Array.from({ length: 8 }, (_, i) => `n${i}`);
    expect(itemsFor({ es: many, en: many, icons: ['fix'] }, 'es')).toHaveLength(MAX_ITEMS);
    expect(itemsFor({ es: many, en: many, icons: ['fix'] }, 'es')[0].icon).toBe('fix');
    expect(itemsFor({ es: [], en: [] }, 'es')).toEqual([]);
  });

  it('a version shows only its own entry, and nothing for a version without one', () => {
    const source = { versions: { '1.2.46': [{ icon: 'game', es: 'Viejo', en: 'Old' }], '1.2.47': [{ icon: 'fix', es: 'Nuevo', en: 'New' }] } };
    expect(notesOfVersion('1.2.47', source)).toEqual({ es: ['Nuevo'], en: ['New'], icons: ['fix'] });
    expect(notesOfVersion('1.2.48', source)).toEqual({ es: [], en: [], icons: [] });
  });

  it('the changelog is well formed: exact versions, 1–5 short translated items, known icons', () => {
    for (const [version, items] of Object.entries(changelog.versions)) {
      expect(versionCodeOf(version), version).not.toBeNull();
      expect(items.length, version).toBeGreaterThan(0);
      expect(items.length, version).toBeLessThanOrEqual(MAX_ITEMS);
      for (const item of items) {
        expect(CHANGE_ICONS as readonly string[]).toContain(item.icon);
        expect(item.es.trim().length).toBeGreaterThan(0);
        expect(item.en.trim().length).toBeGreaterThan(0);
        // short lines, not paragraphs
        expect(item.es.length, item.es).toBeLessThanOrEqual(90);
        expect(item.en.length, item.en).toBeLessThanOrEqual(90);
      }
    }
  });

  it('the release file is valid and translated', () => {
    expect(versionCodeOf(release.version)).not.toBeNull();
    expect(Object.keys(es.update).sort()).toEqual(Object.keys(en.update).sort());
  });
});
