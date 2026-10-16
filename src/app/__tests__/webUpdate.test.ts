import { describe, expect, it } from 'vitest';
import { parseWebVersion, runningEntry } from '../webUpdate';
import { isNewerVersion, latestVersion } from '../changelog';

const docWith = (...srcs: string[]) => ({
  querySelectorAll: () => srcs.map((src) => ({ getAttribute: () => src })) as unknown as NodeListOf<HTMLScriptElement>,
});

describe('web update check', () => {
  it('reads a well-formed version.json', () => {
    const v = parseWebVersion({ entry: 'assets/index-BO1dv5wl.js', version: '1.3.1', notes: { es: ['Arreglo'], en: ['Fix'], icons: ['fix'] } });
    expect(v).toEqual({ entry: 'assets/index-BO1dv5wl.js', version: '1.3.1', notes: { es: ['Arreglo'], en: ['Fix'], icons: ['fix'] } });
  });

  it('ignores anything unexpected', () => {
    for (const bad of [null, 'x', {}, { entry: 'https://evil.example/x.js' }, { entry: '../index.js' }, { entry: 'assets/x.css' }]) expect(parseWebVersion(bad)).toBeNull();
    expect(parseWebVersion({ entry: 'assets/a.js', version: '<b>', notes: { es: [1, 'ok'], icons: ['nope'] } })).toEqual({ entry: 'assets/a.js', version: '', notes: { es: ['ok'], en: [], icons: ['new'] } });
  });

  it('finds the main script the page runs', () => {
    expect(runningEntry(docWith('./assets/index-BO1dv5wl.js'))).toBe('assets/index-BO1dv5wl.js');
    expect(runningEntry(docWith('/Unopro/assets/index-abc.js?v=1'))).toBe('assets/index-abc.js');
    expect(runningEntry(docWith('/src/main.tsx'))).toBeNull();
  });
});

describe('changelog versions', () => {
  it('compares versions by number, not text', () => {
    expect(isNewerVersion('1.3.1', '1.2.93')).toBe(true);
    expect(isNewerVersion('1.2.93', '1.3.1')).toBe(false);
    expect(isNewerVersion('1.2.10', '1.2.9')).toBe(true);
    expect(isNewerVersion('bad', '1.0.0')).toBe(false);
  });

  it('picks the newest entry', () => {
    expect(latestVersion({ versions: { '1.2.93': [], '1.3.1': [], '1.2.100x': [] } })).toBe('1.3.1');
    expect(latestVersion({ versions: {} })).toBeNull();
    expect(latestVersion()).not.toBeNull();
  });
});
