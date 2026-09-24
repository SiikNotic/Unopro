import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, normalizePreferences } from '../preferences';

describe('Preferences', () => {
  it('falls back to defaults for missing or corrupted data', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences('garbage')).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ sound: 'yes', difficulty: 'impossible', scenario: 'mars' })).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid stored values', () => {
    const stored = { sound: false, music: false, musicVolume: 0.6, sfxVolume: 0.3, haptics: false, animations: false, difficulty: 'hard', scenario: 'forest' };
    expect(normalizePreferences(stored)).toEqual(stored);
  });

  it('clamps the music volume to 0–1 and falls back when it is not a number', () => {
    expect(normalizePreferences({ musicVolume: 3 }).musicVolume).toBe(1);
    expect(normalizePreferences({ musicVolume: -1 }).musicVolume).toBe(0);
    expect(normalizePreferences({ musicVolume: 0.456 }).musicVolume).toBe(0.46);
    expect(normalizePreferences({ musicVolume: 'loud' }).musicVolume).toBe(DEFAULT_PREFERENCES.musicVolume);
    expect(normalizePreferences({ music: 'no' }).music).toBe(true);
  });

  it('clamps the effects volume the same way', () => {
    expect(normalizePreferences({ sfxVolume: 9 }).sfxVolume).toBe(1);
    expect(normalizePreferences({ sfxVolume: -2 }).sfxVolume).toBe(0);
    expect(normalizePreferences({ sfxVolume: null }).sfxVolume).toBe(DEFAULT_PREFERENCES.sfxVolume);
  });

  it('uses the existing bot difficulties', () => {
    for (const d of ['easy', 'normal', 'hard']) expect(normalizePreferences({ difficulty: d }).difficulty).toBe(d);
  });
});
