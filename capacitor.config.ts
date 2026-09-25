import type { CapacitorConfig } from '@capacitor/cli';

// The Android app wraps the same web build (dist/). The web on GitHub Pages is unchanged.
const config: CapacitorConfig = {
  appId: 'io.github.siiknotic.carta',
  appName: 'Carta Casino',
  webDir: 'dist',
  server: {
    // The app's pages are served locally under this origin, the same one as the website, so the
    // game's servers (which only answer known origins) accept the app without any change.
    hostname: 'siiknotic.github.io',
    androidScheme: 'https',
  },
  android: {
    // Game content only; no mixed http content.
    allowMixedContent: false,
  },
};

export default config;
