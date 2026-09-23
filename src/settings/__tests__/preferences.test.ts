import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, normalizePreferences } from '../preferences';

describe('Preferences', () => {
  it('falls back to defaults for missing or corrupted data', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences('garbage')).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ sound: 'yes', difficulty: 'impossible', scenario: 'mars' })).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid stored values', () => {
    const stored = { sound: false, haptics: false, animations: false, difficulty: 'hard', scenario: 'forest' };
    expect(normalizePreferences(stored)).toEqual(stored);
  });

  it('uses the existing bot difficulties', () => {
    for (const d of ['easy', 'normal', 'hard']) expect(normalizePreferences({ difficulty: d }).difficulty).toBe(d);
  });
});
