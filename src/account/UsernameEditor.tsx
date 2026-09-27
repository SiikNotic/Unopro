import { useState } from 'react';
import type { FormEvent } from 'react';
import { AtSign, Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAccount } from './useAccount';
import { usernameProblem } from './username';
import './account.css';
import '@/screens/lux/lux.css';

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
    <form className="lx-card lx-form" onSubmit={submit} noValidate>
      <h2 className="lx-card-label">{t('account.username')}</h2>
      <div className="lx-current">
        <span>{t('account.usernameCurrent')}</span>
        <b>{current || '—'}</b>
      </div>
      <div className="ac-field">
        <label htmlFor="ac-username">{t('account.usernameNew')}</label>
        <div className="lx-input-at">
          <AtSign className="w-4 h-4" aria-hidden />
          <input
            id="ac-username"
            className="ac-input"
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
            placeholder={t('account.usernamePlaceholder')}
          />
        </div>
        <p id="ac-username-hint" className="lx-fine">
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
      <button type="submit" className="lx-btn lx-btn-gold" disabled={busy || !draft.trim() || draft.trim() === current} aria-busy={busy}>
        {t('account.usernameSave')}
      </button>
    </form>
  );
}
