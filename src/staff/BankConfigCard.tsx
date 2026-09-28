// Staff → Economy: the Bank's rules (coins per ad, ads per day, loan amount, wait, the balance a loan requires,
// and whether it is paid back). All staff read them; an admin or the owner changes them. The database checks
// the role, validates the values and writes the audit log; the new rules apply to the next payments.
import { useEffect, useState } from 'react';
import { Landmark, Save } from 'lucide-react';
import { useI18n } from '@/i18n';
import { ROLE_RANK } from '@/account/accountContext';
import type { Role } from '@/account/accountContext';
import { staffApi } from './api';
import { fmtDate, fmtNum } from './format';
import { ErrorLine, Loading, Panel } from './ui';
import { useLoader } from './lib';

type Field = 'adAmount' | 'adDailyCap' | 'loanAmount' | 'loanCooldownHours' | 'loanMaxBalance';
const LIMITS: Record<Field, [number, number]> = {
  adAmount: [1, 100000],
  adDailyCap: [0, 100],
  loanAmount: [1, 1000000],
  loanCooldownHours: [1, 720],
  loanMaxBalance: [1, 1000000000],
};
const LABEL: Record<Field, string> = {
  adAmount: 'staff.bank.config.adAmount',
  adDailyCap: 'staff.bank.config.adDailyCap',
  loanAmount: 'staff.bank.config.loanAmount',
  loanCooldownHours: 'staff.bank.config.loanCooldown',
  loanMaxBalance: 'staff.bank.config.loanMaxBalance',
};
const FIELDS = Object.keys(LIMITS) as Field[];

export function BankConfigCard({ version, role, onSaved }: { version: number; role: Role; onSaved: () => void }) {
  const { t, language } = useI18n();
  const cfg = useLoader(() => staffApi.bankConfig(), [version]);
  const canEdit = ROLE_RANK[role] >= 2;
  const [values, setValues] = useState<Record<Field, string>>({ adAmount: '', adDailyCap: '', loanAmount: '', loanCooldownHours: '', loanMaxBalance: '' });
  const [repay, setRepay] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const c = cfg.data;
  useEffect(() => {
    if (!c) return;
    setValues({ adAmount: String(c.adAmount), adDailyCap: String(c.adDailyCap), loanAmount: String(c.loanAmount), loanCooldownHours: String(c.loanCooldownHours), loanMaxBalance: String(c.loanMaxBalance) });
    setRepay(c.loanRequiresRepayment);
  }, [c]);

  const num = (f: Field) => Number(values[f]);
  const valid = FIELDS.every((f) => values[f] !== '' && Number.isInteger(num(f)) && num(f) >= LIMITS[f][0] && num(f) <= LIMITS[f][1]);
  const changed = !!c && (FIELDS.some((f) => num(f) !== Number(c[f])) || repay !== c.loanRequiresRepayment);

  const save = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    const r = await staffApi.setBankConfig(
      { adAmount: num('adAmount'), adDailyCap: num('adDailyCap'), loanAmount: num('loanAmount'), loanCooldownHours: num('loanCooldownHours'), loanMaxBalance: num('loanMaxBalance'), loanRequiresRepayment: repay },
      reason.trim()
    );
    setBusy(false);
    if (!r.ok) return setError(r.code);
    setReason('');
    setDone(true);
    onSaved();
  };

  return (
    <Panel title={t('staff.bank.config.title')} icon={Landmark}>
      <ErrorLine code={cfg.error} />
      {!c ? (
        !cfg.error && <Loading />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--cz-muted)]">{t('staff.bank.config.open', { count: fmtNum(Number(c.openLoans), language), coins: fmtNum(Number(c.openLoanCoins), language) })}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FIELDS.map((f) => (
              <label key={f} className="flex flex-col gap-1 text-xs text-[var(--cz-muted)] min-w-0">
                {t(LABEL[f])}
                <input id={`bank-cfg-${f}`} className="sd-input" inputMode="numeric" value={values[f]} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value.replace(/[^0-9]/g, '') }))} />
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-[var(--cz-ivory)] min-w-0 self-end pb-2">
              <input id="bank-cfg-repay" type="checkbox" checked={repay} disabled={!canEdit} onChange={(e) => setRepay(e.target.checked)} />
              {t('staff.bank.config.loanRepay')}
            </label>
          </div>
          <p className="text-xs text-[var(--cz-muted)]">
            {canEdit ? t('staff.bank.config.note') : t('staff.bank.config.readOnly')} {c.updatedBy ? t('staff.horse.lastChange', { who: c.updatedBy, when: fmtDate(c.updatedAt, language) }) : ''}
          </p>
          {canEdit && changed && (
            <>
              <textarea className="sd-textarea" placeholder={t('staff.games.reasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} />
              {!valid && <p className="ac-error">{t('staff.bank.config.invalid')}</p>}
              <button type="button" className="cz-btn cz-btn-primary cz-btn-sm self-start" disabled={busy || !valid || reason.trim().length < 3} onClick={() => void save()}>
                <Save className="w-4 h-4" aria-hidden /> {t('staff.bank.config.save')}
              </button>
            </>
          )}
          {error && (
            <p className="ac-error" role="alert">
              {t(`staff.errors.${error}`)}
            </p>
          )}
          {done && <p className="text-xs text-emerald-300">{t('staff.bank.config.saved')}</p>}
        </div>
      )}
    </Panel>
  );
}
