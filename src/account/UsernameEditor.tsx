import { useState } from 'react';
import type { FormEvent } from 'react';
import { AtSign, Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAccount } from './useAccount';
import { usernameProblem } from './username';
import './account.css';

/** Profile → Username → change. The database checks format, reserved words and (case-insensitive) uniqueness. */
export function UsernameEditor() {
  const { t } = useI18n();
  const account = useAccount();
  const current = account.profile?.username ?? '';
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    setSaved(false);
    if (name.toLowerCase() === current.toLowerCase() && name === current) return setError('same');
    const local = usernameProblem(name);
    if (local) return setError(local);
    setBusy(true);
    setError(null);
    const res = await account.setUsername(name);
    setBusy(false);
    if (res.ok) {
      setDraft('');
      setSaved(true);
      return;
    }
    setError(res.code === 'conflict' ? 'taken' : res.code === 'banned' ? 'banned' : res.code === 'invalid' && (res.detail === 'reserved' || res.detail === 'format') ? res.detail : 'server');
  };

  return (
    <form className="cz-panel p-4 flex flex-col gap-3" onSubmit={submit} noValidate>
      <h2 className="cz-label">{t('account.username')}</h2>
      <div>
        <p className="text-xs text-[var(--cz-muted)]">{t('account.usernameCurrent')}</p>
        <p className="font-display font-extrabold text-lg text-white break-all">{current || '—'}</p>
      </div>
      <div className="ac-field">
        <label htmlFor="ac-username">{t('account.usernameNew')}</label>
        <div className="relative">
          <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cz-muted)]" aria-hidden />
          <input
            id="ac-username"
            className="ac-input !pl-9"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.replace(/\s/g, ''));
              setError(null);
              setSaved(false);
            }}
            maxLength={16}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!error || undefined}
            aria-describedby="ac-username-hint"
          />
        </div>
        <p id="ac-username-hint" className="text-xs text-[var(--cz-muted)]">
          {t('account.usernameHint')}
        </p>
      </div>
      {error && (
        <p className="ac-error" role="alert">
          {t(`account.usernameErrors.${error}`)}
        </p>
      )}
      {saved && (
        <p className="text-sm text-emerald-300 flex items-center gap-1.5" role="status">
          <Check className="w-4 h-4" aria-hidden /> {t('account.notice.usernameChanged', { name: current })}
        </p>
      )}
      <button type="submit" className="cz-btn cz-btn-primary w-full" disabled={busy || !draft.trim()} aria-busy={busy}>
        {t('account.usernameSave')}
      </button>
    </form>
  );
}
