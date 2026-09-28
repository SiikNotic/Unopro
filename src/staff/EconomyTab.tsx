// Staff → Economy: where coins come from and where they go in the period (play, the Bank, the welcome bonus and
// the team's manual adjustments), the Bank's activity, the largest balances and the latest adjustments.
import { useMemo } from 'react';
import { Coins, Crown, Gift, Landmark, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '@/i18n';
import { staffApi } from './api';
import type { StaffReport } from './api';
import { AuditList, BankList } from './AuditList';
import { BankConfigCard } from './BankConfigCard';
import type { Role } from '@/account/accountContext';
import { fmtNum, signed } from './format';
import { UserTable } from './PlayersTab';
import { ErrorLine, Kpi, Loading, Panel, PeriodPicker } from './ui';
import { rtpText, useLoader } from './lib';
import type { Period } from './lib';

export function EconomyTab({ report, reportError, period, onPeriod, version, role, onChanged, onOpen }: { report: StaffReport | null; reportError: string | null; period: Period; onPeriod: (p: Period) => void; version: number; role: Role; onChanged: () => void; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  const top = useLoader(() => staffApi.users('', 'balance', 10), [version]);
  const audit = useLoader(() => staffApi.audit(200), [version]);
  const bank = useLoader(() => staffApi.bank(60), [version]);
  const adjustments = useMemo(() => (audit.data ?? []).filter((a) => a.action === 'ADD_COINS' || a.action === 'REMOVE_COINS').slice(0, 20), [audit.data]);
  const r = report;
  const n = (v: number | undefined) => (r ? fmtNum(Number(v ?? 0), language) : '…');
  const staked = Number(r?.play.staked ?? 0);
  const paid = Number(r?.play.paid ?? 0);
  const adminNet = Number(r?.adminAdded ?? 0) - Number(r?.adminRemoved ?? 0);
  // Coins that entered circulation in the period from outside play (bonus, Bank, team adjustments).
  const minted = Number(r?.bonusPaid ?? 0) + Number(r?.bankPaid ?? 0) + adminNet;

  return (
    <>
      <div className="sd-title-row">
        <h2 className="sd-h">{t('staff.tabs.economy')}</h2>
        <PeriodPicker value={period} onChange={onPeriod} />
      </div>
      <ErrorLine code={reportError} />
      <h3 className="sd-h2">{t('staff.eco.play')}</h3>
      <div className="sd-kpis">
        <Kpi label={t('staff.now.coins')} value={n(r?.coins)} icon={Coins} hint={t('staff.eco.circulationHint')} />
        <Kpi label={t('staff.money.staked')} value={n(staked)} />
        <Kpi label={t('staff.money.paid')} value={n(paid)} />
        <Kpi label={t('staff.money.house')} value={r ? signed(staked - paid, language) : '…'} tone={r ? (staked - paid >= 0 ? 'good' : 'bad') : undefined} hint={r ? t('staff.eco.rtpValue', { rtp: rtpText(paid, staked) }) : undefined} />
      </div>
      <h3 className="sd-h2">{t('staff.eco.sources')}</h3>
      <div className="sd-kpis">
        <Kpi label={t('staff.eco.bonus')} value={n(r?.bonusPaid)} icon={Gift} />
        <Kpi label={t('staff.eco.bank')} value={n(r?.bankPaid)} icon={Landmark} hint={r ? t('staff.eco.bankHint', { loans: fmtNum(Number(r.loans), language), ads: fmtNum(Number(r.adRewards), language), rejected: fmtNum(Number(r.adRejected), language) }) : undefined} />
        <Kpi label={t('staff.eco.adjustments')} value={r ? signed(adminNet, language) : '…'} icon={SlidersHorizontal} hint={r ? t('staff.eco.adjustHint', { n: fmtNum(Number(r.adjustments), language), added: fmtNum(Number(r.adminAdded), language), removed: fmtNum(Number(r.adminRemoved), language) }) : undefined} />
        <Kpi label={t('staff.eco.minted')} value={r ? signed(minted, language) : '…'} hint={t('staff.eco.mintedHint')} />
      </div>

      <BankConfigCard version={version} role={role} onSaved={onChanged} />

      <div className="sd-grid-2">
        <Panel title={t('staff.bank.title')} icon={Landmark} flush>
          <p className="sd-muted text-xs px-3.5 pt-2">{t('staff.bank.hint')}</p>
          <ErrorLine code={bank.error} />
          {bank.data ? <BankList rows={bank.data} onOpen={onOpen} /> : !bank.error && <Loading />}
        </Panel>
        <Panel title={t('staff.adjustments')} icon={SlidersHorizontal} flush>
          <ErrorLine code={audit.error} />
          {audit.data ? <AuditList rows={adjustments} onOpen={onOpen} /> : !audit.error && <Loading />}
        </Panel>
      </div>

      <Panel title={t('staff.topBalances')} icon={Crown} flush>
        <ErrorLine code={top.error} />
        {top.data ? (
          <div className="sd-scroll">
            <UserTable rows={top.data} onOpen={onOpen} />
          </div>
        ) : (
          !top.error && <Loading />
        )}
      </Panel>
    </>
  );
}
