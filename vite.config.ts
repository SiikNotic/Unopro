import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Content Security Policy for the published build only (the dev server needs inline scripts for HMR).
// Scripts may only come from this site plus Cloudflare Turnstile; fonts are self-hosted. Avatars from the
// Google / Discord sign-in are the only remote images. Nothing may be framed except the Turnstile widget,
// and no plugin, base-URL change, form post or plain-HTTP request is allowed.
const cspFor = (apiOrigins: string[]) => [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: https://lh3.googleusercontent.com https://cdn.discordapp.com",
  "media-src 'self' data: blob:",
  // Supabase + Cloudflare Turnstile verification/challenge traffic.
  ["connect-src 'self' https://challenges.cloudflare.com", ...apiOrigins].join(' '),
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  'upgrade-insecure-requests',
].join('; ');

const originOf = (u: string | undefined) => {
  try {
    return u && /^https:\/\//.test(u) ? [new URL(u).origin] : [];
  } catch {
    return [];
  }
};

function securityHeaders(csp: string): Plugin {
  return {
    name: 'carta-security-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
      ],
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const https = [...originOf(env.VITE_SUPABASE_URL), ...originOf(env.VITE_SLOTS_API_URL), ...originOf(env.VITE_GAMES_API_URL)];
  // Online rooms receive their updates over wss://<project>.supabase.co/realtime/v1.
  const wss = originOf(env.VITE_SUPABASE_URL).map((o) => o.replace(/^https:/, 'wss:'));
  const csp = cspFor([...new Set([...https, ...wss])]);
  return {
    // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages at /<repo>/).
    // The app keeps navigation in memory (no URL routes), so a page refresh always lands on index.html.
    base: './',
    plugins: [react(), securityHeaders(csp)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
