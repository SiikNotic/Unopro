// "Delete account": explains what is removed, asks to type a confirmation word, then asks the server.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAccount } from './useAccount';

export function DeleteAccount() {
  const { t } = useI18n();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = t('account.delete.word');
  if (account.status !== 'user') return null;
  return (
    <div className="mt-2 rounded-2xl border border-[rgba(255,120,130,0.3)] bg-[rgba(80,10,20,0.25)] p-3">
      {!open ? (
        <button type="button" className="cz-btn cz-btn-quiet w-full !text-[#ffb3b3]" onClick={() => setOpen(true)}>
          <Trash2 className="w-4 h-4" /> {t('account.delete.title')}
        </button>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-bold text-[#ffd0d0]">{t('account.delete.title')}</p>
          <p className="text-white/75">{t('account.delete.what')}</p>
          <p className="text-white/60 text-xs">{t('account.delete.kept')}</p>
          <label className="text-xs text-white/70" htmlFor="del-confirm">
            {t('account.delete.type', { word })}
          </label>
          <input id="del-confirm" className="ac-input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {error && (
            <p className="text-[#ffb3b3] text-xs" role="alert">
              {t(`account.delete.errors.${error}`)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="cz-btn cz-btn-secondary" onClick={() => (setOpen(false), setTyped(''), setError(null))} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="cz-btn cz-btn-primary !bg-[#b91c3c] !text-white !border-transparent"
              disabled={busy || typed.trim().toUpperCase() !== word.toUpperCase()}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await account.deleteAccount();
                setBusy(false);
                if (!r.ok) setError(['owner_protected', 'unauthorized', 'network'].includes(r.code ?? '') ? r.code! : 'server');
              }}
            >
              {t('account.delete.confirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
