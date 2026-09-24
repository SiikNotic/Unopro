// Minimal anonymous sign-in against a Supabase Auth (GoTrue) endpoint, without the SDK. The server
// identifies the player only from the resulting JWT; the browser never tells it who it is.
import { storage } from '@/storage';

const KEY = 'carta.slots.session';

interface Session {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. */
  expires_at: number;
}

const isSession = (x: unknown): x is Session => {
  const s = x as Partial<Session> | null;
  return !!s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' && typeof s.expires_at === 'number';
};

export interface AnonAuthOptions {
  /** e.g. https://<project>.supabase.co/auth/v1 */
  authUrl: string;
  /** Public (publishable) key the gateway requires; not a secret. */
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** One sign-in in flight per auth server, shared by every client (a second one would create a second player). */
const inflightByServer = new Map<string, Promise<string | null>>();

export function createAnonAuth(opts: AnonAuthOptions): () => Promise<string | null> {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = () => Math.floor((opts.now ?? Date.now)() / 1000);

  async function request(path: string, body: unknown): Promise<Session | null> {
    const res = await doFetch(`${opts.authUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: opts.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Session> & { expires_in?: number };
    const session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at ?? now() + (data.expires_in ?? 0) };
    return isSession(session) ? session : null;
  }

  async function obtain(): Promise<string | null> {
    const saved = storage.get<unknown>(KEY);
    if (isSession(saved) && saved.expires_at - 60 > now()) return saved.access_token;
    let next: Session | null = null;
    try {
      if (isSession(saved)) next = await request('/token?grant_type=refresh_token', { refresh_token: saved.refresh_token });
      // Anonymous sign-in only when there is no account yet: a failed refresh must not silently swap
      // the player for a brand-new one with a fresh balance.
      else next = await request('/signup', {});
    } catch {
      return null;
    }
    if (!next) return null;
    storage.set(KEY, next);
    return next.access_token;
  }

  return () => {
    const running = inflightByServer.get(opts.authUrl);
    if (running) return running;
    const p = obtain().finally(() => inflightByServer.delete(opts.authUrl));
    inflightByServer.set(opts.authUrl, p);
    return p;
  };
}
