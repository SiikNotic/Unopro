// Bot protection for sign-ups and sign-ins (Cloudflare Turnstile, checked by Supabase Auth). Supabase
// verifies the token on its side with the secret key, so the browser can't skip it: when CAPTCHA
// protection is on in Supabase, a request without a valid token is refused.
//
// Off until VITE_TURNSTILE_SITE_KEY is set (a public key, not a secret). The widget only shows itself when
// Cloudflare needs the player to interact; otherwise it runs unseen. A token is single-use, so each auth
// request asks for a fresh one.

const SITE_KEY: string = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export const captchaEnabled = () => SITE_KEY !== '';

let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('captcha_unavailable')));
    s.onerror = () => {
      loading = null;
      reject(new Error('captcha_unavailable'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** A fresh CAPTCHA token, or undefined when CAPTCHA is not configured. Rejects if it can't be solved. */
export async function captchaToken(): Promise<string | undefined> {
  if (!captchaEnabled() || typeof document === 'undefined') return undefined;
  const turnstile = await loadTurnstile();
  const host = document.createElement('div');
  host.className = 'captcha-host';
  document.body.appendChild(host);
  let id = '';
  try {
    return await new Promise<string>((resolve, reject) => {
      id = turnstile.render(host, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        callback: (token: string) => resolve(token),
        'error-callback': () => reject(new Error('captcha_failed')),
        'expired-callback': () => reject(new Error('captcha_failed')),
        'timeout-callback': () => reject(new Error('captcha_failed')),
      });
    });
  } finally {
    if (id) turnstile.remove(id);
    host.remove();
  }
}

/** The body field Supabase Auth reads the token from. Empty when CAPTCHA is off. */
export async function captchaField(get: () => Promise<string | undefined> = captchaToken): Promise<{ gotrue_meta_security?: { captcha_token: string } }> {
  const token = await get();
  return token ? { gotrue_meta_security: { captcha_token: token } } : {};
}
