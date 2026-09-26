import { describe, expect, it } from 'vitest';
import { shouldShowApkBanner } from '../apkBanner';
import { LATEST_APK_URL } from '../updates';

describe('APK banner', () => {
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
  it('shows on the website, never inside the app or on iPhone, and stays closed for a week', () => {
    const now = 1_000_000_000_000;
    expect(shouldShowApkBanner({ native: false, userAgent: android, closedAt: null, now })).toBe(true);
    expect(shouldShowApkBanner({ native: true, userAgent: android, closedAt: null, now })).toBe(false);
    expect(shouldShowApkBanner({ native: false, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', closedAt: null, now })).toBe(false);
    expect(shouldShowApkBanner({ native: false, userAgent: android, closedAt: now - 3 * 86400000, now })).toBe(false);
    expect(shouldShowApkBanner({ native: false, userAgent: android, closedAt: now - 8 * 86400000, now })).toBe(true);
  });
  it('links to the newest release asset, not a fixed version', () => {
    expect(LATEST_APK_URL).toBe('https://github.com/SiikNotic/Unopro/releases/latest/download/carta.apk');
  });
});
