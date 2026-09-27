// Staff → Games → Crash: statistics for a period, recent rounds and one round with every bet. The server sends a
// round's crash point and seed only once it has crashed, so this panel cannot show a result in advance.
import { useState } from 'react';
import { ChevronLeft, Info } from 'lucide-react';
import { useI18n } from '@/i18n';
import { staffApi } from './api';
import { fmtDate, fmtNum, signed } from './format';
import { Ago, Empty, ErrorLine, Kpi, Loading, Panel, PeriodPicker, PlayerLink } from './ui';
import { rtpText, useLoader } from './lib';
import type { Period } from './lib';

const mult = (m: number | null | undefined) => (m === null || m === undefined ? '—' : `${Number(m).toFixed(2)}×`);

export function CrashAdmin({ version, onOpen }: { version: number; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  const [days, setDays] = useState<Period>(7);
  const [open, setOpen] = useState<number | null>(null);
  const stats = useLoader(() => staffApi.crashStats(days), [version, days]);
  const rounds = useLoader(() => staffApi.crashRounds(40), [version]);
  if (open !== null) return <CrashRound id={open} onBack={() => setOpen(null)} onOpen={onOpen} />;
  const s = stats.data;
  const n = (v: number | null | undefined) => (s ? fmtNum(Number(v ?? 0), language) : '…');
  const staked = Number(s?.staked ?? 0);
  const paid = Number(s?.paid ?? 0);
  return (
    <>
      <div className="sd-title-row">
        <h3 className="sd-h2">{t('staff.crash.stats')}</h3>
        <PeriodPicker value={days} onChange={setDays} />
      </div>
      <ErrorLine code={stats.error ?? rounds.error} />
      <div className="sd-kpis">
        <Kpi label={t('staff.crash.rounds')} value={n(s?.rounds)} />
        <Kpi label={t('staff.kpi.bets')} value={n(s?.bets)} />
        <Kpi label={t('staff.kpi.bettors')} value={n(s?.players)} />
        <Kpi label={t('staff.money.staked')} value={n(staked)} />
        <Kpi label={t('staff.money.paid')} value={n(paid)} />
        <Kpi label={t('staff.money.house')} value={s ? signed(staked - paid, language) : '…'} tone={s ? (staked - paid >= 0 ? 'good' : 'bad') : undefined} />
        <Kpi label={t('staff.money.rtp')} value={s ? rtpText(paid, staked) : '…'} />
        <Kpi label={t('staff.crash.instant')} value={s ? (Number(s.rounds) ? `${((Number(s.instant) / Number(s.rounds)) * 100).toFixed(1)} %` : '—') : '…'} hint={t('staff.crash.instantHint')} />
        <Kpi label={t('staff.crash.median')} value={s ? mult(s.medianCrash) : '…'} />
        <Kpi label={t('staff.crash.maxCashout')} value={s ? mult(s.maxCashout) : '…'} hint={s?.biggestPayout ? t('staff.crash.biggest', { n: fmtNum(Number(s.biggestPayout), language) }) : undefined} />
      </div>
      <p className="sd-note">
        <Info className="w-4 h-4 shrink-0" aria-hidden /> {t('staff.crash.note')}
      </p>
      <Panel title={t('staff.crash.recent')} flush>
        {!rounds.data ? (
          !rounds.error && <Loading />
        ) : rounds.data.length === 0 ? (
          <Empty />
        ) : (
          <div className="sd-scroll">
            <table className="sd-table">
              <thead>
                <tr>
                  <th>{t('staff.crash.round')}</th>
                  <th>{t('staff.horse.when')}</th>
                  <th className="sd-num">{t('staff.crash.point')}</th>
                  <th className="sd-num">{t('staff.kpi.bets')}</th>
                  <th className="sd-num">{t('staff.money.staked')}</th>
                  <th className="sd-num">{t('staff.money.paid')}</th>
                </tr>
              </thead>
              <tbody>
                {rounds.data.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r.id)} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(r.id)}>
                    <td className="tabular-nums">#{r.id}</td>
                    <td className="whitespace-nowrap">
                      <Ago iso={r.starts_at} />
                    </td>
                    <td className="sd-num">{r.crashed ? mult(r.multiplier) : <span className="sd-badge ok">{t('staff.crash.live')}</span>}</td>
                    <td className="sd-num">{fmtNum(Number(r.bets), language)}</td>
                    <td className="sd-num">{fmtNum(Number(r.staked), language)}</td>
                    <td className="sd-num">{fmtNum(Number(r.paid), language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function CrashRound({ id, onBack, onOpen }: { id: number; onBack: () => void; onOpen: (id: string) => void }) {
  const { t, language } = useI18n();
  const round = useLoader(() => staffApi.crashRound(id), [id]);
  const r = round.data;
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" aria-hidden /> {t('staff.horse.back')}
        </button>
        <h3 className="sd-h2 flex-1 min-w-0 truncate">{t('staff.crash.roundN', { n: id })}</h3>
      </div>
      <ErrorLine code={round.error} />
      {!r ? (
        !round.error && <Loading />
      ) : (
        <>
          <Panel>
            <dl className="sd-dl">
              <dt>{t('staff.horse.when')}</dt>
              <dd>{fmtDate(r.startsAt, language)}</dd>
              <dt>{t('staff.crash.point')}</dt>
              <dd>{r.crashed ? <b className="text-white">{mult(r.multiplier)}</b> : t('staff.crash.notYet')}</dd>
              <dt>SHA-256</dt>
              <dd className="sd-mono break-all">{r.hash}</dd>
              <dt>{t('staff.horse.seed')}</dt>
              <dd className="sd-mono break-all">{r.seed ?? t('staff.crash.notYet')}</dd>
            </dl>
          </Panel>
          <Panel title={t('staff.crash.bets', { n: r.bets.length })} flush>
            {r.bets.length === 0 ? (
              <Empty />
            ) : (
              <div className="sd-scroll">
                <table className="sd-table">
                  <thead>
                    <tr>
                      <th>{t('staff.horse.player')}</th>
                      <th className="sd-num">{t('staff.horse.amount')}</th>
                      <th className="sd-num">{t('staff.crash.auto')}</th>
                      <th className="sd-num">{t('staff.crash.cashout')}</th>
                      <th className="sd-num">{t('staff.horse.result')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.bets.map((b) => (
                      <tr key={b.id} className="is-static">
                        <td>
                          <PlayerLink id={b.userId} name={b.username} onOpen={onOpen} />
                        </td>
                        <td className="sd-num">{fmtNum(Number(b.amount), language)}</td>
                        <td className="sd-num">{mult(b.auto)}</td>
                        <td className="sd-num">{mult(b.cashout)}</td>
                        <td className={`sd-num ${b.status === 'cashed' ? 'sd-plus' : b.status === 'lost' ? 'sd-minus' : ''}`}>
                          {b.status === 'cashed' ? `+${fmtNum(Number(b.payout ?? 0), language)}` : b.status === 'lost' ? `−${fmtNum(Number(b.amount), language)}` : t('staff.horse.pending')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
