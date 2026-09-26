// Staff → Horse Racing: statistics, races (with the result and every bet), latest bets, and the configuration.
// All staff can read; RTP and bet limits can be changed by an admin or the owner (the database checks the role and
// writes the audit log); switching the game on and off stays in Staff → Games (owner).
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Save } from 'lucide-react';
import { useI18n } from '@/i18n';
import { ROLE_RANK } from '@/account/accountContext';
import type { Role } from '@/account/accountContext';
import { staffApi } from './api';
import type { HorseConfig, HorseRaceDetail, HorseStaffBet } from './api';
import { fmtDate, fmtNum, signed } from './format';

function useFetch<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; code: string }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    void fn().then((r) => {
      if (mine !== seq.current) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs explicitly
  }, deps);
  return { data, error };
}

const pct = (bp: number | null | undefined) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toFixed(2)}%`);
const odds = (o: number) => `${(o / 100).toFixed(2)}×`;

export function HorseAdmin({ version, role, onChanged }: { version: number; role: Role; onChanged: () => void }) {
  const { t, language } = useI18n();
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState<number | null>(null);
  const stats = useFetch(() => staffApi.horseStats(days), [version, days]);
  const races = useFetch(() => staffApi.horseRaces(50), [version]);
  const bets = useFetch(() => staffApi.horseBets(50), [version]);
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '…' : fmtNum(Number(v), language));
  const canEdit = ROLE_RANK[role] >= 2;

  if (open !== null) return <RaceDetail id={open} onBack={() => setOpen(null)} />;
  const s = stats.data;
  return (
    <>
      <h2 className="sd-h">{t('staff.horse.title')}</h2>
      {(stats.error || races.error || bets.error) && (
        <p className="ac-error" role="alert">
          {t(`staff.errors.${stats.error ?? races.error ?? bets.error}`)}
        </p>
      )}

      <ConfigCard config={s?.config ?? null} canEdit={canEdit} onSaved={onChanged} />

      <div className="flex items-center justify-between gap-2 mt-2">
        <h3 className="cz-label">{t('staff.horse.stats')}</h3>
        <div className="sd-seg" role="group" aria-label={t('staff.horse.period')}>
          {[1, 7, 30].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
              {t('staff.horse.days', { n: d })}
            </button>
          ))}
        </div>
      </div>
      <div className="sd-kpis">
        <Kpi label={t('staff.horse.races')} value={n(s?.races)} />
        <Kpi label={t('staff.horse.bets')} value={n(s?.bets)} />
        <Kpi label={t('staff.horse.players')} value={n(s?.players)} />
        <Kpi label={t('staff.horse.staked')} value={n(s?.staked)} />
        <Kpi label={t('staff.horse.paid')} value={n(s?.paid)} />
        <Kpi label={t('staff.horse.net')} value={s ? signed(Number(s.net), language) : '…'} />
        <Kpi label={t('staff.horse.rtpRealized')} value={s ? pct(s.rtpRealized) : '…'} hint={t('staff.horse.rtpTarget', { rtp: pct(s?.config.rtp) })} />
      </div>
      {s && s.byHorse.length > 0 && (
        <section className="sd-card overflow-x-auto">
          <table className="sd-table">
            <thead>
              <tr>
                <th>{t('staff.horse.horse')}</th>
                <th className="text-right">{t('staff.horse.wins')}</th>
                <th className="text-right">{t('staff.horse.runs')}</th>
                <th className="text-right">{t('staff.horse.bets')}</th>
                <th className="text-right">{t('staff.horse.staked')}</th>
                <th className="text-right">{t('staff.horse.paid')}</th>
              </tr>
            </thead>
            <tbody>
              {s.byHorse.map((h) => (
                <tr key={h.horse} className="!cursor-default">
                  <td>
                    #{h.horse} {t(`horse.names.${h.horse}`)}
                  </td>
                  <td className="text-right tabular-nums">{fmtNum(Number(h.wins), language)}</td>
                  <td className="text-right tabular-nums">{fmtNum(Number(h.runs), language)}</td>
                  <td className="text-right tabular-nums">{fmtNum(Number(h.bets), language)}</td>
                  <td className="text-right tabular-nums">{fmtNum(Number(h.staked), language)}</td>
                  <td className="text-right tabular-nums">{fmtNum(Number(h.paid), language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <h3 className="cz-label mt-2">{t('staff.horse.raceList')}</h3>
      <section className="sd-card overflow-x-auto">
        <table className="sd-table">
          <thead>
            <tr>
              <th>{t('staff.horse.race')}</th>
              <th>{t('staff.horse.when')}</th>
              <th className="text-right">{t('staff.horse.winner')}</th>
              <th className="text-right">{t('staff.horse.bets')}</th>
              <th className="text-right">{t('staff.horse.staked')}</th>
              <th className="text-right">{t('staff.horse.paid')}</th>
            </tr>
          </thead>
          <tbody>
            {(races.data ?? []).map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)}>
                <td className="tabular-nums">#{r.id}</td>
                <td className="whitespace-nowrap">{fmtDate(r.startsAt, language)}</td>
                <td className="text-right">{r.winner ? `#${r.winner}` : t('staff.horse.pending')}</td>
                <td className="text-right tabular-nums">{fmtNum(Number(r.bets), language)}</td>
                <td className="text-right tabular-nums">{fmtNum(Number(r.staked), language)}</td>
                <td className="text-right tabular-nums">{fmtNum(Number(r.paid), language)}</td>
              </tr>
            ))}
            {races.data && races.data.length === 0 && (
              <tr className="!cursor-default">
                <td colSpan={6} className="text-[var(--cz-muted)]">
                  {t('staff.none')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <h3 className="cz-label mt-2">{t('staff.horse.latestBets')}</h3>
      <BetsTable rows={bets.data ?? []} onRace={setOpen} />
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="sd-card sd-kpi">
      <span>{label}</span>
      <b className="cz-num">{value}</b>
      {hint && <span className="block mt-0.5 text-[11px]">{hint}</span>}
    </div>
  );
}

function BetsTable({ rows, onRace }: { rows: HorseStaffBet[]; onRace?: (id: number) => void }) {
  const { t, language } = useI18n();
  return (
    <section className="sd-card overflow-x-auto">
      <table className="sd-table">
        <thead>
          <tr>
            <th>{t('staff.horse.player')}</th>
            {onRace && <th>{t('staff.horse.race')}</th>}
            <th className="text-right">{t('staff.horse.horse')}</th>
            <th className="text-right">{t('staff.horse.amount')}</th>
            <th className="text-right">{t('staff.horse.odds')}</th>
            <th className="text-right">{t('staff.horse.result')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} onClick={onRace ? () => onRace(b.race) : undefined} className={onRace ? '' : '!cursor-default'}>
              <td className="truncate max-w-[140px]">{b.username ?? '—'}</td>
              {onRace && <td className="tabular-nums">#{b.race}</td>}
              <td className="text-right">#{b.horse}</td>
              <td className="text-right tabular-nums">{fmtNum(Number(b.amount), language)}</td>
              <td className="text-right tabular-nums">{odds(Number(b.odds))}</td>
              <td className={`text-right tabular-nums ${b.status === 'won' ? 'text-emerald-300' : b.status === 'lost' ? 'text-[#ffb3b3]' : ''}`}>
                {b.status === 'won' ? `+${fmtNum(Number(b.payout ?? 0), language)}` : b.status === 'lost' ? `−${fmtNum(Number(b.amount), language)}` : t('staff.horse.pending')}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="!cursor-default">
              <td colSpan={6} className="text-[var(--cz-muted)]">
                {t('staff.none')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function RaceDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { t, language } = useI18n();
  const race = useFetch<HorseRaceDetail>(() => staffApi.horseRace(id), [id]);
  const r = race.data;
  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" aria-hidden /> {t('staff.horse.back')}
        </button>
        <h2 className="sd-h flex-1 min-w-0 truncate">{t('staff.horse.raceN', { n: id })}</h2>
      </div>
      {race.error && (
        <p className="ac-error" role="alert">
          {t(`staff.errors.${race.error}`)}
        </p>
      )}
      {r && (
        <>
          <section className="sd-card p-3 flex flex-col gap-1.5 text-sm">
            <p>
              {t('staff.horse.when')}: {fmtDate(r.startsAt, language)} · RTP {pct(r.rtp)} · {t('staff.horse.limits', { min: fmtNum(r.minBet, language), max: fmtNum(r.maxBet, language) })}
            </p>
            <p>
              {t('staff.horse.result')}: {r.order ? r.order.map((h, i) => `${i + 1}.º #${h}`).join(' · ') : t('staff.horse.pending')}
            </p>
            <p className="sd-mono break-all text-xs">SHA-256: {r.hash}</p>
            {r.seed && <p className="sd-mono break-all text-xs">{t('staff.horse.seed')}: {r.seed}</p>}
          </section>
          <section className="sd-card overflow-x-auto">
            <table className="sd-table">
              <thead>
                <tr>
                  <th>{t('staff.horse.horse')}</th>
                  <th className="text-right">{t('staff.horse.odds')}</th>
                  <th className="text-right">{t('staff.horse.place')}</th>
                </tr>
              </thead>
              <tbody>
                {r.runners.map((x) => (
                  <tr key={x.horse} className="!cursor-default">
                    <td>
                      #{x.horse} {t(`horse.names.${x.horse}`)}
                    </td>
                    <td className="text-right tabular-nums">{odds(x.odds)}</td>
                    <td className="text-right">{r.order ? `${r.order.indexOf(x.horse) + 1}.º` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <h3 className="cz-label mt-2">{t('staff.horse.bets')}</h3>
          <BetsTable rows={r.bets.map((b) => ({ ...b, race: r.id }))} />
        </>
      )}
    </>
  );
}

function ConfigCard({ config, canEdit, onSaved }: { config: HorseConfig | null; canEdit: boolean; onSaved: () => void }) {
  const { t, language } = useI18n();
  const [rtp, setRtp] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!config) return;
    setRtp((config.rtp / 100).toFixed(2));
    setMin(String(config.minBet));
    setMax(String(config.maxBet));
  }, [config]);
  if (!config) return null;
  const rtpBp = Math.round(Number(rtp.replace(',', '.')) * 100);
  const minN = Number(min);
  const maxN = Number(max);
  const valid = Number.isFinite(rtpBp) && rtpBp >= 8000 && rtpBp <= 9900 && Number.isInteger(minN) && Number.isInteger(maxN) && minN >= 1 && maxN <= 1000000 && minN <= maxN;
  const changed = rtpBp !== config.rtp || minN !== config.minBet || maxN !== config.maxBet;
  const save = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    const r = await staffApi.setHorseConfig(rtpBp, minN, maxN, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(r.code);
    setReason('');
    setDone(true);
    onSaved();
  };
  return (
    <section className="sd-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-white">{t('staff.horse.config')}</h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${config.enabled ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-[#ffb3b3]'}`}>
          {t(config.enabled ? 'staff.games.on' : 'staff.games.off')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--cz-muted)]">
          RTP (%)
          <input className="sd-input" inputMode="decimal" value={rtp} onChange={(e) => setRtp(e.target.value.replace(/[^0-9.,]/g, ''))} disabled={!canEdit} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--cz-muted)]">
          {t('staff.horse.minBet')}
          <input className="sd-input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ''))} disabled={!canEdit} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--cz-muted)]">
          {t('staff.horse.maxBet')}
          <input className="sd-input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9]/g, ''))} disabled={!canEdit} />
        </label>
      </div>
      <p className="text-xs text-[var(--cz-muted)]">
        {canEdit ? t('staff.horse.configNote') : t('staff.horse.configReadOnly')} {config.updatedBy ? t('staff.horse.lastChange', { who: config.updatedBy, when: fmtDate(config.updatedAt, language) }) : ''}
      </p>
      {canEdit && changed && (
        <>
          <textarea className="sd-textarea" placeholder={t('staff.games.reasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} />
          {!valid && <p className="ac-error">{t('staff.horse.invalid')}</p>}
          <button type="button" className="cz-btn cz-btn-primary cz-btn-sm self-start" disabled={busy || !valid || reason.trim().length < 3} onClick={() => void save()}>
            <Save className="w-4 h-4" aria-hidden /> {t('staff.horse.save')}
          </button>
        </>
      )}
      {error && (
        <p className="ac-error" role="alert">
          {t(`staff.errors.${error}`)}
        </p>
      )}
      {done && <p className="text-xs text-emerald-300">{t('staff.horse.saved')}</p>}
    </section>
  );
}

