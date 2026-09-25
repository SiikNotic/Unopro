import { beforeEach, describe, expect, it } from 'vitest';
import { authErrorOf, createAuthApi, decodeJwt, newPkce, readAuthReturn, takePkceVerifier } from '../authApi';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as { window?: unknown }).window = { location: { origin: 'https://siiknotic.github.io', pathname: '/Unopro/' }, dispatchEvent: () => true };
});

const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`;

describe('auth api', () => {
  it('maps GoTrue errors to what the screen can explain', () => {
    expect(authErrorOf(400, { error_code: 'invalid_credentials' }).code).toBe('invalid_credentials');
    expect(authErrorOf(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }).code).toBe('invalid_credentials');
    expect(authErrorOf(400, { error_code: 'email_not_confirmed' }).code).toBe('email_not_confirmed');
    expect(authErrorOf(422, { error_code: 'user_already_exists' }).code).toBe('user_exists');
    expect(authErrorOf(422, { error_code: 'weak_password' }).code).toBe('weak_password');
    expect(authErrorOf(429, {}).code).toBe('rate_limited');
    expect(authErrorOf(400, { msg: 'Unsupported provider: provider is not enabled' }).code).toBe('provider_disabled');
    expect(authErrorOf(500, null).code).toBe('unknown');
  });

  it('reads the return URL: PKCE code, password reset marker, implicit tokens, errors', () => {
    expect(readAuthReturn({ search: '', hash: '' })).toBeNull();
    expect(readAuthReturn({ search: '?code=abc', hash: '' })).toEqual({ code: 'abc', recovery: false, error: undefined });
    expect(readAuthReturn({ search: '?reset=1&code=abc', hash: '' })?.recovery).toBe(true);
    expect(readAuthReturn({ search: '', hash: '#access_token=a&refresh_token=r&expires_in=3600' })?.tokens?.refresh_token).toBe('r');
    expect(readAuthReturn({ search: '?error=access_denied&error_description=denied', hash: '' })?.error).toBe('denied');
  });

  it('makes a PKCE pair (S256) and hands the verifier back once', async () => {
    const { verifier, challenge } = await newPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    expect(challenge).toBe(btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    expect(takePkceVerifier()).toBe(verifier);
    expect(takePkceVerifier()).toBeNull();
  });

  it('decodes the JWT claims it needs (anonymous or not)', () => {
    expect(decodeJwt(jwt({ sub: 'u1', is_anonymous: true }))?.is_anonymous).toBe(true);
    expect(decodeJwt('garbage')).toBeNull();
  });

  it('signs up with a PKCE challenge and says plainly when the address is taken', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    let reply: unknown = { id: 'u', identities: [{ id: 'i' }] };
    const api = createAuthApi({ authUrl: 'https://p.supabase.co/auth/v1', apiKey: 'k' }, (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as typeof fetch);
    expect(await api.signUp('a@b.co', 'secret123', 'Ana')).toEqual({ session: null });
    expect(calls[0].url).toContain('/signup?redirect_to=https%3A%2F%2Fsiiknotic.github.io%2FUnopro%2F');
    expect(calls[0].body).toMatchObject({ email: 'a@b.co', password: 'secret123', code_challenge_method: 's256', data: { name: 'Ana' } });
    reply = { id: 'u', identities: [] };
    await expect(api.signUp('a@b.co', 'secret123', '')).rejects.toMatchObject({ code: 'user_exists' });
    reply = { access_token: 't', refresh_token: 'r', expires_in: 3600, user: { id: 'u' } };
    expect((await api.signUp('c@d.co', 'secret123', '')).session?.access_token).toBe('t');
  });

  it('builds the Google / Discord URL with PKCE and the app as the return address', async () => {
    const api = createAuthApi({ authUrl: 'https://p.supabase.co/auth/v1', apiKey: 'k' });
    const url = new URL(await api.oauthUrl('discord'));
    expect(url.pathname).toBe('/auth/v1/authorize');
    expect(url.searchParams.get('provider')).toBe('discord');
    expect(url.searchParams.get('redirect_to')).toBe('https://siiknotic.github.io/Unopro/');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
  });

  it('reports a network failure as such', async () => {
    const api = createAuthApi({ authUrl: 'https://p/auth/v1', apiKey: 'k' }, (async () => {
      throw new TypeError('offline');
    }) as typeof fetch);
    await expect(api.signIn('a@b.co', 'x')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('inside the Android app', () => {
  it('sends Supabase back to the app link, and reads what the link carries', async () => {
    const { appReturnUrl, isNativeApp, NATIVE_RETURN_URL, readAuthReturn: read } = await import('../authApi');
    const g = globalThis as { Capacitor?: unknown };
    g.Capacitor = { isNativePlatform: () => true };
    try {
      expect(isNativeApp()).toBe(true);
      expect(appReturnUrl()).toBe('io.github.siiknotic.carta://auth');
      const u = new URL(`${NATIVE_RETURN_URL}?code=abc`);
      expect(read({ search: u.search, hash: u.hash })).toEqual({ code: 'abc', recovery: false, error: undefined });
      const r = new URL(`${NATIVE_RETURN_URL}?reset=1&code=xyz`);
      expect(read({ search: r.search, hash: r.hash })).toMatchObject({ code: 'xyz', recovery: true });
    } finally {
      delete g.Capacitor;
    }
    expect(isNativeApp()).toBe(false);
  });
});
