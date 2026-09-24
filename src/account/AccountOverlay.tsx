import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Gift, KeyRound, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useNavigation } from '@/components/Navigation';
import { useAccount } from './useAccount';
import { AuthError, PASSWORD_MIN } from './authApi';
import './account.css';

/** Account notices (welcome credit, confirmations, errors) and the new-password form after a reset link. */
export function AccountOverlay() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const { notice, dismissNotice } = account;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice || notice.kind === 'bonus') return;
    const id = window.setTimeout(dismissNotice, 6000);
    return () => window.clearTimeout(id);
  }, [notice, dismissNotice]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) return setError(t('account.errors.short_password'));
    setBusy(true);
    setError(null);
    try {
      await account.updatePassword(password);
      setPassword('');
    } catch (err) {
      setError(t(`account.errors.${err instanceof AuthError ? err.code : 'unknown'}`));
    } finally {
      setBusy(false);
    }
  };

  const text = !notice
    ? ''
    : notice.kind === 'bonus'
      ? notice.migrated > 0
        ? t(notice.capped ? 'account.notice.bonusMigratedCapped' : 'account.notice.bonusMigrated', { amount: notice.amount.toLocaleString(), migrated: notice.migrated.toLocaleString() })
        : t('account.notice.bonus', { amount: notice.amount.toLocaleString() })
      : notice.kind === 'migrated'
        ? t(notice.capped ? 'account.notice.migratedCapped' : 'account.notice.migrated', { migrated: notice.migrated.toLocaleString() })
        : notice.kind === 'coinsAdjusted'
          ? t(notice.amount > 0 ? 'account.notice.coinsAdded' : 'account.notice.coinsRemoved', { amount: Math.abs(notice.amount).toLocaleString() })
          : notice.kind === 'usernameChanged'
            ? t('account.notice.usernameChanged', { name: notice.username })
            : notice.kind === 'welcome'
        ? t('account.notice.welcome')
        : notice.kind === 'error'
          ? t(`account.errors.${notice.code}`)
          : t(`account.notice.${notice.kind}`);

  return (
    <>
      {notice && (
        <div className="ac-toast" role="status" aria-live="polite">
          {notice.kind === 'bonus' ? <Gift className="w-6 h-6 shrink-0 text-[var(--cz-gold)]" aria-hidden /> : <CheckCircle2 className={`w-6 h-6 shrink-0 ${notice.kind === 'error' ? 'text-[#ffb3b3]' : 'text-emerald-300'}`} aria-hidden />}
          <p className="text-sm text-[var(--cz-ivory)] flex-1 basis-[200px] min-w-0">{text}</p>
          {notice.kind === 'bonus' && (
            <button
              type="button"
              className="cz-btn cz-btn-primary cz-btn-sm"
              onClick={() => {
                dismissNotice();
                navigate('home');
              }}
            >
              {t('account.play')}
            </button>
          )}
          {notice.kind === 'confirmed' && (
            <button
              type="button"
              className="cz-btn cz-btn-primary cz-btn-sm"
              onClick={() => {
                dismissNotice();
                navigate('account');
              }}
            >
              {t('account.signIn')}
            </button>
          )}
          <button type="button" className="cz-btn cz-btn-quiet cz-icon-btn" onClick={dismissNotice} aria-label={t('common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {account.recovering && (
        <div className="ac-modal-back" role="dialog" aria-modal="true" aria-labelledby="ac-reset-title">
          <form className="ac-modal cz-panel p-5 flex flex-col gap-4" onSubmit={submit}>
            <div className="flex items-center gap-3">
              <KeyRound className="w-6 h-6 text-[var(--cz-gold)]" aria-hidden />
              <h2 id="ac-reset-title" className="font-display font-extrabold text-lg text-white">
                {t('account.newPassword')}
              </h2>
            </div>
            <div className="ac-field">
              <label htmlFor="ac-new-password">{t('account.password')}</label>
              <input id="ac-new-password" className="ac-input" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} minLength={PASSWORD_MIN} maxLength={72} required />
              <p className="text-xs text-[var(--cz-muted)]">{t('account.passwordHint', { n: PASSWORD_MIN })}</p>
            </div>
            {error && (
              <p className="ac-error" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className="cz-btn cz-btn-secondary flex-1" onClick={account.cancelRecovery}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="cz-btn cz-btn-primary flex-1" disabled={busy} aria-busy={busy}>
                {t('account.savePassword')}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
