// When the website shows the "get the Android app" banner (see ApkBanner.tsx).
/** When the player last closed the banner (it stays hidden for a week). */
export const APK_BANNER_KEY = 'apkBanner.closedAt';
const HIDE_MS = 7 * 24 * 3600 * 1000;

export function shouldShowApkBanner(opts: { native: boolean; userAgent: string; closedAt: number | null; now: number }): boolean {
  if (opts.native) return false;
  if (/iPhone|iPad|iPod/i.test(opts.userAgent)) return false;
  return !(opts.closedAt && opts.now - opts.closedAt < HIDE_MS);
}
