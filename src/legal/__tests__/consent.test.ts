import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { consentGiven, rememberConsent, takePendingConsent, TERMS_VERSION } from '../consent';
import { LEGAL_CONFIG } from '../config';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('sign-up consent', () => {
  it('needs both boxes: 18+ and the legal texts', () => {
    expect(consentGiven({ adult: true, terms: true })).toBe(true);
    expect(consentGiven({ adult: false, terms: true })).toBe(false);
    expect(consentGiven({ adult: true, terms: false })).toBe(false);
  });

  it('is remembered across the sign-up redirect, used once, and expires', () => {
    const t0 = 1_800_000_000_000;
    expect(takePendingConsent(t0)).toBe(false);
    rememberConsent(t0);
    expect(takePendingConsent(t0 + 60_000)).toBe(true);
    expect(takePendingConsent(t0 + 60_000)).toBe(false);
    rememberConsent(t0);
    expect(takePendingConsent(t0 + 8 * 24 * 3600_000)).toBe(false);
  });

  it('matches the version the database requires, and the minimum age is 18', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261002000000_terms_acceptance.sql'), 'utf8');
    expect(sql).toContain(`select '${TERMS_VERSION}'::text`);
    expect(LEGAL_CONFIG.minimumAge).toBe(18);
  });
});
