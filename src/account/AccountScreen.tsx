import { useState } from 'react';
import type { FormEvent } from 'react';
import { Coins, Eye, EyeOff, Gift, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { formatChips } from '@/casino/chipValues';
import { useAccount } from './useAccount';
import { AuthError, PASSWORD_MIN } from './authApi';
import type { AuthErrorCode, OAuthProvider } from './authApi';
import './account.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function DiscordLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 127.14 96.36" aria-hidden fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="ac-pass">
      <input id={id} className="ac-input" type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={invalid || undefined} required minLength={PASSWORD_MIN} maxLength={72} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={t(shown ? 'account.hidePassword' : 'account.showPassword')} aria-pressed={shown}>
        {shown ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}

const codeOf = (e: unknown): AuthErrorCode => (e instanceof AuthError ? e.code : 'unknown');

/** Sign in or create an account (email, Google, Discord). */
function SignInPanel() {
  const { t } = useI18n();
  const account = useAccount();
  const [tab, setTab] = useState<'signin' | 'signup'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'form' | OAuthProvider>(null);
  const [error, setError] = useState<AuthErrorCode | 'short_password' | 'bad_email' | null>(null);
  const [sent, setSent] = useState<null | 'confirm' | 'reset'>(null);
  const [resent, setResent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL_RE.test(email.trim())) return setError('bad_email');
    if (password.length < PASSWORD_MIN) return setError('short_password');
    setBusy('form');
    setError(null);
    try {
      if (tab === 'signin') await account.signIn(email, password);
      else if ((await account.signUp(email, password, name)) === 'check_email') setSent('confirm');
    } catch (err) {
      setError(codeOf(err));
    } finally {
      setBusy(null);
    }
  };

  const provider = async (p: OAuthProvider) => {
    setBusy(p);
    setError(null);
    try {
      await account.signInWith(p);
    } catch (err) {
      setError(codeOf(err));
      setBusy(null);
    }
  };

  const forgot = async () => {
    if (!EMAIL_RE.test(email.trim())) return setError('bad_email');
    setBusy('form');
    setError(null);
    try {
      await account.sendPasswordReset(email);
      setSent('reset');
    } catch (err) {
      setError(codeOf(err));
    } finally {
      setBusy(null);
    }
  };

  if (sent) {
    return (
      <section className="cz-panel p-5 flex flex-col items-center text-center gap-3" aria-live="polite">
        <span className="w-14 h-14 rounded-2xl bg-[rgba(216,178,106,0.14)] border border-[rgba(216,178,106,0.4)] flex items-center justify-center">
          <Mail className="w-7 h-7 text-[var(--cz-gold)]" aria-hidden />
        </span>
        <h2 className="font-display font-extrabold text-xl text-white">{t(sent === 'confirm' ? 'account.checkEmail' : 'account.resetSent')}</h2>
        <p className="text-sm text-white/75 max-w-[36ch]">{t(sent === 'confirm' ? 'account.checkEmailText' : 'account.resetSentText', { email: email.trim() })}</p>
        <p className="text-xs text-[var(--cz-muted)] max-w-[40ch]">{t('account.sameBrowser')}</p>
        {sent === 'confirm' && (
          <button
            type="button"
            className="cz-btn cz-btn-secondary"
            disabled={resent}
            onClick={async () => {
              try {
                await account.resendConfirmation(email);
                setResent(true);
              } catch (err) {
                setError(codeOf(err));
              }
            }}
          >
            {t(resent ? 'account.resent' : 'account.resend')}
          </button>
        )}
        <button type="button" className="cz-btn cz-btn-quiet" onClick={() => { setSent(null); setTab('signin'); }}>
          {t('account.backToSignIn')}
        </button>
        {error && <p className="ac-error" role="alert">{t(`account.errors.${error}`)}</p>}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="ac-hero">
        <svg className="ac-coin-stack" width="96" height="96" viewBox="0 0 96 96" aria-hidden>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${14 + i * 6} ${54 - i * 14})`}>
              <ellipse cx="30" cy="12" rx="28" ry="10" fill="#8a6320" />
              <rect x="2" y="4" width="56" height="8" fill="#b98a35" />
              <ellipse cx="30" cy="4" rx="28" ry="10" fill="#e8c887" />
              <ellipse cx="30" cy="4" rx="18" ry="6" fill="none" stroke="#a8792c" strokeWidth="2" />
            </g>
          ))}
        </svg>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(216,178,106,0.45)] bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cz-gold-hover)]">
          <Gift className="w-3.5 h-3.5" aria-hidden /> {t('account.bonusTag')}
        </span>
        <h2 className="mt-2 font-display font-extrabold text-2xl text-white leading-tight max-w-[18ch]">{t('account.pitch')}</h2>
        <p className="mt-1 text-sm text-white/75 max-w-[34ch]">{t('account.pitchText')}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button type="button" className="ac-provider ac-google" onClick={() => void provider('google')} disabled={!!busy} aria-busy={busy === 'google'}>
          <GoogleLogo /> {t('account.withGoogle')}
        </button>
        <button type="button" className="ac-provider ac-discord" onClick={() => void provider('discord')} disabled={!!busy} aria-busy={busy === 'discord'}>
          <DiscordLogo /> {t('account.withDiscord')}
        </button>
      </div>

      <div className="ac-divider">{t('account.orEmail')}</div>

      <form className="cz-panel p-4 flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="ac-tabs" role="tablist" aria-label={t('account.title')}>
          {(['signup', 'signin'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setError(null); }}>
              {t(k === 'signup' ? 'account.signUp' : 'account.signIn')}
            </button>
          ))}
        </div>
        {tab === 'signup' && (
          <div className="ac-field">
            <label htmlFor="ac-name">{t('account.name')}</label>
            <input id="ac-name" className="ac-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" placeholder={t('account.namePlaceholder')} />
          </div>
        )}
        <div className="ac-field">
          <label htmlFor="ac-email">{t('account.email')}</label>
          <input id="ac-email" className="ac-input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254} aria-invalid={error === 'bad_email' || undefined} />
        </div>
        <div className="ac-field">
          <label htmlFor="ac-password">{t('account.password')}</label>
          <PasswordInput id="ac-password" value={password} onChange={setPassword} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} invalid={error === 'short_password' || error === 'weak_password'} />
          {tab === 'signup' && <p className="text-xs text-[var(--cz-muted)]">{t('account.passwordHint', { n: PASSWORD_MIN })}</p>}
        </div>
        {error && (
          <p className="ac-error" role="alert">
            {t(`account.errors.${error}`)}
          </p>
        )}
        <button type="submit" className="cz-btn cz-btn-primary cz-btn-lg w-full" disabled={!!busy} aria-busy={busy === 'form'}>
          {busy === 'form' ? t('account.working') : t(tab === 'signup' ? 'account.createAccount' : 'account.signIn')}
        </button>
        {tab === 'signin' && (
          <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm self-center" onClick={() => void forgot()} disabled={!!busy}>
            {t('account.forgot')}
          </button>
        )}
      </form>
      <p className="flex items-start gap-2 text-xs text-[var(--cz-muted)]">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-px" aria-hidden /> {t('account.guestNote')}
      </p>
    </section>
  );
}

/** The signed-in player: who, their coins, sign out. */
function AccountPanel() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const u = account.user;
  const [busy, setBusy] = useState(false);
  const [avatarOk, setAvatarOk] = useState(true);
  const shown = u?.name || u?.email || t('profile.guest');
  const providerLabel = u?.provider === 'google' ? 'Google' : u?.provider === 'discord' ? 'Discord' : t('account.email');

  return (
    <section className="flex flex-col gap-4">
      <div className="cz-panel p-4 flex items-center gap-4">
        {u?.avatar && avatarOk ? (
          <img src={u.avatar} alt="" referrerPolicy="no-referrer" onError={() => setAvatarOk(false)} className="flex-none w-14 h-14 rounded-2xl object-cover border border-[rgba(216,178,106,0.4)]" />
        ) : (
          <div className="flex-none w-14 h-14 rounded-2xl bg-[rgba(216,178,106,0.14)] border border-[rgba(216,178,106,0.4)] flex items-center justify-center font-display font-extrabold text-xl text-[var(--cz-gold)]" aria-hidden>
            {shown.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-extrabold text-xl text-white truncate">{shown}</h2>
          {u?.email && u.email !== shown && <p className="text-xs text-white/70 truncate">{u.email}</p>}
          <p className="text-xs text-[var(--cz-muted)] mt-0.5">{t('account.via', { provider: providerLabel })}</p>
        </div>
      </div>

      <div className="ac-hero">
        <span className="cz-label !text-[var(--cz-gold-hover)]">{t('account.coins')}</span>
        <div className="mt-2 flex items-center gap-2">
          <Coins className="w-8 h-8 text-[var(--cz-gold)]" aria-hidden />
          <span className="ac-amount cz-num" aria-live="polite">
            {account.coins ? formatChips(account.coins.balance) : '—'}
          </span>
        </div>
        <p className="mt-2 text-sm text-white/75">{account.coins?.bonusClaimed ? t('account.bonusDone') : account.coinsError ? t('account.coinsError') : t('account.bonusPending')}</p>
        {account.coinsError && (
          <button type="button" className="cz-btn cz-btn-secondary cz-btn-sm mt-3" onClick={() => void account.refreshCoins()}>
            {t('account.retry')}
          </button>
        )}
        {account.coins && !account.coins.bonusClaimed && account.coins.registered && (
          <button type="button" className="cz-btn cz-btn-primary cz-btn-sm mt-3" onClick={() => void account.claimBonus()}>
            <Gift className="w-4 h-4" /> {t('account.claim')}
          </button>
        )}
        <p className="mt-3 text-xs text-white/60">{t('account.coinsNote')}</p>
      </div>

      <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full" onClick={() => navigate('home')}>
        {t('account.play')}
      </button>
      <button
        type="button"
        className="cz-btn cz-btn-secondary w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await account.signOut();
          setBusy(false);
        }}
      >
        <LogOut className="w-4 h-4" /> {t('account.signOut')}
      </button>
      <p className="text-xs text-[var(--cz-muted)]">{t('account.signOutNote')}</p>
    </section>
  );
}

export function AccountScreen() {
  const { t } = useI18n();
  const { status } = useAccount();
  return (
    <ScreenContainer title={t('account.title')} subtitle={t(status === 'user' ? 'account.subtitleUser' : 'account.subtitle')}>
      {status === 'off' ? (
        <section className="cz-panel p-5 flex gap-3 items-start" role="note">
          <UserRound className="w-5 h-5 shrink-0 text-[var(--cz-gold)]" aria-hidden />
          <p className="text-sm text-white/80">{t('account.off')}</p>
        </section>
      ) : status === 'loading' ? (
        <div className="cz-panel p-6 text-center text-sm text-[var(--cz-muted)]" aria-busy="true">
          {t('account.loading')}
        </div>
      ) : status === 'user' ? (
        <AccountPanel />
      ) : (
        <SignInPanel />
      )}
    </ScreenContainer>
  );
}
