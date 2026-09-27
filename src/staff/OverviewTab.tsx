// Staff → Summary: what needs attention, the numbers for the chosen period, the trend, play per game, the biggest
// wins and the latest team actions. Everything links to the place where it can be looked into or acted on.
import { AlertTriangle, CheckCircle2, ChevronRight, Coins, Crown, Gamepad2, Info, KeyRound, ScrollText, TrendingUp, Trophy, UserPlus, Users, Wifi } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Role } from '@/account/accountContext';
import type { Availability } from '@/games/availability';
import { CONTROLLED_GAMES } from '@/games/availability';
import { staffApi } from './api';
import type { StaffReport } from './api';
import { fmtNum, signed } from './format';
import { AuditList } from './AuditList';
import { TrendChart } from './TrendChart';
import { Ago, Empty, ErrorLine, Kpi, Loading, Panel, PeriodPicker, PlayerLink } from './ui';

import type { Section } from './StaffScreen';
import { rtpText, useGameName, useLoader } from './lib';
import type { Period } from './lib';

const BIG_WIN = 50000;

interface Alert {
  key: string;
  tone: 'warn' | 'info';
  text: string;
  action: string;
  onClick: () => void;
}

export function OverviewTab({
  report,
  reportError,
  games,
  period,
  onPeriod,
  version,
  role,
  go,
  onOpen,
  onGame,
}: {
  report: StaffReport | null;
  reportError: string | null;
  games: Availability | null;
  period: Period;
  onPeriod: (p: Period) => void;
  version: number;
  role: Role;
  go: (s: Section) => void;
  onOpen: (id: string) => void;
  onGame: (g: string) => void;
}) {
  const { t, language } = useI18n();
  const gameName = useGameName();
  const recent = useLoader(() => staffApi.audit(6), [version]);
  const n = (v: number | undefined) => (report ? fmtNum(Number(v ?? 0), language) : '…');
  const r = report;
  const staked = Number(r?.play.staked ?? 0);
  const paid = Number(r?.play.paid ?? 0);
  const house = staked - paid;

  const alerts: Alert[] = [];
  const off = games ? CONTROLLED_GAMES.filter((g) => games[g] === false) : [];
  if (off.length)
    alerts.push({ key: 'off', tone: 'warn', text: t('staff.attention.gamesOff', { n: off.length, games: off.map((g) => t(`availability.games.${g}`)).join(', ') }), action: t('staff.attention.openGames'), onClick: () => go('games') });
  if (r && house < 0) alerts.push({ key: 'house', tone: 'warn', text: t('staff.attention.houseLoses', { amount: fmtNum(-house, language) }), action: t('staff.attention.openGames'), onClick: () => go('games') });
  const big = r?.bigWins?.[0];
  if (big && Number(big.payout) >= BIG_WIN)
    alerts.push({ key: 'big', tone: 'info', text: t('staff.attention.bigWin', { name: big.username ?? '—', amount: fmtNum(Number(big.payout), language), game: gameName(big.game) }), action: t('staff.attention.openPlayer'), onClick: () => onOpen(big.userId) });
  if (r && Number(r.adRejected) > 0) alerts.push({ key: 'ads', tone: 'info', text: t('staff.attention.adsRejected', { n: fmtNum(Number(r.adRejected), language) }), action: t('staff.attention.openEconomy'), onClick: () => go('economy') });
  if (r && Number(r.adjustments) > 0)
    alerts.push({ key: 'adj', tone: 'info', text: t('staff.attention.adjustments', { n: fmtNum(Number(r.adjustments), language), added: fmtNum(Number(r.adminAdded), language), removed: fmtNum(Number(r.adminRemoved), language) }), action: t('staff.attention.openAudit'), onClick: () => go('audit') });
  if (r && Number(r.banned) > 0) alerts.push({ key: 'bans', tone: 'info', text: t('staff.attention.activeBans', { n: fmtNum(Number(r.banned), language) }), action: t('staff.attention.openBans'), onClick: () => go('bans') });

  const byGame = Object.entries(r?.byGame ?? {}).sort((a, b) => Number(b[1].staked) - Number(a[1].staked));

  return (
    <>
      <div className="sd-title-row">
        <h2 className="sd-h">{t('staff.tabs.overview')}</h2>
        <PeriodPicker value={period} onChange={onPeriod} />
      </div>
      <ErrorLine code={reportError} />

      <div className="sd-now" aria-label={t('staff.now.title')}>
        <NowItem icon={Wifi} label={t('staff.now.online')} value={n(r?.online)} live />
        <NowItem icon={Users} label={t('staff.now.registered')} value={n(r?.registered)} />
        <NowItem icon={Coins} label={t('staff.now.coins')} value={n(r?.coins)} />
        <NowItem icon={KeyRound} label={t('staff.now.banned')} value={n(r?.banned)} />
      </div>

      <Panel title={t('staff.attention.title')} icon={AlertTriangle} flush>
        {!r && !reportError ? (
          <Loading />
        ) : alerts.length === 0 ? (
          <p className="sd-ok">
            <CheckCircle2 className="w-4 h-4" aria-hidden /> {t('staff.attention.allGood')}
          </p>
        ) : (
          <ul className="sd-alerts">
            {alerts.map((a) => (
              <li key={a.key} className={`is-${a.tone}`}>
                {a.tone === 'warn' ? <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden /> : <Info className="w-4 h-4 shrink-0" aria-hidden />}
                <span className="flex-1 min-w-0">{a.text}</span>
                <button type="button" className="sd-chip-btn" onClick={a.onClick}>
                  {a.action} <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="sd-kpis">
        <Kpi label={t('staff.money.staked')} value={n(staked)} icon={Coins} />
        <Kpi label={t('staff.money.paid')} value={n(paid)} />
        <Kpi label={t('staff.money.house')} value={r ? signed(house, language) : '…'} tone={r ? (house >= 0 ? 'good' : 'bad') : undefined} hint={t('staff.money.houseHint')} />
        <Kpi label={t('staff.money.rtp')} value={r ? rtpText(paid, staked) : '…'} hint={t('staff.money.rtpHint')} />
        <Kpi label={t('staff.kpi.bets')} value={n(r?.play.rounds)} icon={Gamepad2} />
        <Kpi label={t('staff.kpi.bettors')} value={n(r?.play.players)} />
        <Kpi label={t('staff.kpi.newUsers')} value={n(r?.newUsers)} icon={UserPlus} />
        <Kpi label={t('staff.kpi.activeUsers')} value={n(r?.activeUsers)} />
      </div>

      <Panel title={t('staff.chart.title')} icon={TrendingUp}>
        {r ? r.series.length ? <TrendChart report={r} /> : <Empty /> : <Loading />}
      </Panel>

      <div className="sd-grid-2">
        <Panel title={t('staff.byGame.titlePeriod')} icon={Gamepad2} flush action={<button type="button" className="sd-link text-xs" onClick={() => go('games')}>{t('staff.seeAll')}</button>}>
          {!r ? (
            <Loading />
          ) : byGame.length === 0 ? (
            <Empty>{t('staff.byGame.noPlay')}</Empty>
          ) : (
            <div className="sd-scroll">
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>{t('staff.byGame.game')}</th>
                    <th className="sd-num">{t('staff.kpi.bets')}</th>
                    <th className="sd-num">{t('staff.money.staked')}</th>
                    <th className="sd-num">{t('staff.money.houseShort')}</th>
                    <th className="sd-num">{t('staff.money.rtpShort')}</th>
                  </tr>
                </thead>
                <tbody>
                  {byGame.map(([g, v]) => (
                    <tr key={g} onClick={() => onGame(g)} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onGame(g)}>
                      <td className="font-semibold text-white whitespace-nowrap">{gameName(g)}</td>
                      <td className="sd-num">{fmtNum(Number(v.rounds), language)}</td>
                      <td className="sd-num">{fmtNum(Number(v.staked), language)}</td>
                      <td className={`sd-num ${Number(v.staked) - Number(v.paid) < 0 ? 'sd-minus' : ''}`}>{signed(Number(v.staked) - Number(v.paid), language)}</td>
                      <td className="sd-num">{rtpText(Number(v.paid), Number(v.staked))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t('staff.winners.title')} icon={Trophy} flush>
          {!r ? (
            <Loading />
          ) : r.bigWins.length === 0 && r.topWinners.length === 0 ? (
            <Empty />
          ) : (
            <>
              <p className="sd-sub">{t('staff.winners.big')}</p>
              <ul className="sd-list">
                {r.bigWins.map((b, i) => (
                  <li key={`${b.userId}-${i}`} className="sd-row">
                    <span className="min-w-0 flex-1">
                      <PlayerLink id={b.userId} name={b.username} onOpen={onOpen} />
                      <span className="sd-muted text-[11px] block">
                        {gameName(b.game)} · <Ago iso={b.at} />
                      </span>
                    </span>
                    <b className="cz-num sd-plus">+{fmtNum(Number(b.payout), language)}</b>
                  </li>
                ))}
              </ul>
              {r.topWinners.length > 0 && (
                <>
                  <p className="sd-sub">{t('staff.winners.net')}</p>
                  <ul className="sd-list">
                    {r.topWinners.map((w) => (
                      <li key={w.userId} className="sd-row">
                        <span className="min-w-0 flex-1">
                          <PlayerLink id={w.userId} name={w.username} onOpen={onOpen} />
                          <span className="sd-muted text-[11px] block">{t('staff.winners.detail', { bets: fmtNum(Number(w.rounds), language), staked: fmtNum(Number(w.staked), language) })}</span>
                        </span>
                        <b className="cz-num sd-plus">{signed(Number(w.net), language)}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </Panel>
      </div>

      <div className="sd-grid-2">
        <Panel title={t('staff.recentActions')} icon={ScrollText} flush action={<button type="button" className="sd-link text-xs" onClick={() => go('audit')}>{t('staff.seeAll')}</button>}>
          <ErrorLine code={recent.error} />
          {recent.data ? <AuditList rows={recent.data} onOpen={onOpen} compact /> : !recent.error && <Loading />}
        </Panel>
        <Permissions role={role} />
      </div>
    </>
  );
}

function NowItem({ icon: Icon, label, value, live }: { icon: LucideIcon; label: string; value: string; live?: boolean }) {
  return (
    <div className="sd-now-item">
      <Icon className="w-4 h-4" aria-hidden />
      <span className="min-w-0">
        <b className="cz-num">
          {live && <i className="sd-dot" aria-hidden />}
          {value}
        </b>
        <span>{label}</span>
      </span>
    </div>
  );
}

/** What this role can do, so nobody has to guess why a button is missing. */
function Permissions({ role }: { role: Role }) {
  const { t } = useI18n();
  const rows: { key: string; min: number }[] = [
    { key: 'view', min: 1 },
    { key: 'ban', min: 1 },
    { key: 'coins', min: 2 },
    { key: 'config', min: 2 },
    { key: 'roles', min: 3 },
    { key: 'games', min: 3 },
  ];
  const rank = { user: 0, staff: 1, admin: 2, owner: 3 }[role];
  return (
    <Panel title={t('staff.perms.title', { role: t(`account.roleLabel.${role}`) })} icon={Crown}>
      <ul className="sd-perms">
        {rows.map((p) => (
          <li key={p.key} className={rank >= p.min ? 'is-on' : ''}>
            {rank >= p.min ? <CheckCircle2 className="w-4 h-4" aria-hidden /> : <span className="sd-perm-off" aria-hidden />}
            <span>{t(`staff.perms.${p.key}`)}</span>
            {rank < p.min && <span className="sd-muted text-[11px] ml-auto">{t(`staff.perms.need${p.min}`)}</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
