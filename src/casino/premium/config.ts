// Which house decides spins. With no server configured the game runs in local mode (decided in this
// browser) and says so; set these at build time to use the server instead. None of them is a secret.
//   VITE_SLOTS_API_URL      https://<project>.supabase.co/functions/v1/slot-spin
//   VITE_SUPABASE_URL       https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY  the project's public (publishable) key
export interface RemoteConfig {
  apiUrl: string;
  authUrl: string;
  apiKey: string;
}

export function remoteConfig(env: Record<string, unknown> = import.meta.env): RemoteConfig | null {
  const apiUrl = env.VITE_SLOTS_API_URL;
  const base = env.VITE_SUPABASE_URL;
  const apiKey = env.VITE_SUPABASE_ANON_KEY;
  if (typeof apiUrl !== 'string' || typeof base !== 'string' || typeof apiKey !== 'string') return null;
  // HTTPS only; plain http is accepted for a server on this machine during development.
  const ok = (u: string) => /^https:\/\//.test(u) || (env.DEV === true && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u));
  if (!ok(apiUrl) || !ok(base) || !apiKey) return null;
  return { apiUrl: apiUrl.replace(/\/$/, ''), authUrl: `${base.replace(/\/$/, '')}/auth/v1`, apiKey };
}
