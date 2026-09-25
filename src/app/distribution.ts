/**
 * Which build this is: 'direct' (web, and the APK from GitHub Releases, which can update itself) or 'play'
 * (the Google Play bundle, built with VITE_DISTRIBUTION=play: no self-update, Google Play updates it).
 */
export const DISTRIBUTION: 'direct' | 'play' = import.meta.env.VITE_DISTRIBUTION === 'play' ? 'play' : 'direct';
