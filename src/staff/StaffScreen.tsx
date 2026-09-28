import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Ban, Coins, Gamepad2, LayoutDashboard, RefreshCw, ScrollText, Search, ShieldX, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useAccount } from '@/account/useAccount';
import { onlineConfig } from '@/games/online/client';
import { subscribeLive } from '@/account/live';
import { ROLE_RANK } from '@/account/accountContext';
import type { Role } from '@/account/accountContext';
import { CONTROLLED_GAMES } from '@/games/availability';
import type { Availability, ControlledGame } from '@/games/availability';
import { staffApi } from './api';
import type { StaffReport } from './api';
import { createStaffFeed } from './feed';
import { UserDetailPanel } from './UserDetail';
import { OverviewTab } from './OverviewTab';
import { PlayersTab } from './PlayersTab';
import { GamesTab } from './GamesTab';
import { EconomyTab } from './EconomyTab';
import { AuditTab, BansTab } from './ModerationTabs';
import { RoleBadge } from './ui';

import './staff.css';
import { gameOfLedger } from './lib';
import type { Period } from './lib';

export type Section = 'overview' | 'users' | 'games' | 'economy' | 'bans' | 'audit';
const SECTIONS: { id: Section; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'users', icon: Users },
  { id: 'games', icon: Gamepad2 },
  { id: 'economy', icon: Coins },
  { id: 'bans', icon: Ban },
  { id: 'audit', icon: ScrollText },
];

/**
 * Staff dashboard. What it shows comes from database functions that check the caller's role; a player
 * who opens this screen gets "access denied" from the server, not just a hidden button.
 */
export function StaffScreen() {
  const { t } = useI18n();
  const { back } = useNavigation();
  const account = useAccount();
  const [section, setSection] = useState<Section>('overview');
  const [denied, setDenied] = useState(false);
  const [period, setPeriod] = useState<Period>(1);
  const [report, setReport] = useState<StaffReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [games, setGames] = useState<Availability | null>(null);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [openGame, setOpenGame] = useState<ControlledGame | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [headerQuery, setHeaderQuery] = useState('');
  // Bumped by live events and by the refresh button: sections reload their data.
  const [version, setVersion] = useState(0);
  const [live, setLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const myRole: Role = account.profile?.role ?? 'user';
  const myId = account.profile?.userId ?? '';
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const loadReport = useCallback(async () => {
    const r = await staffApi.report(period);
    setRefreshing(false);
    if (r.ok) {
      setReport(r.data);
      setReportError(null);
    } else if (r.code === 'forbidden' || r.code === 'not_registered' || r.code === 'banned') setDenied(true);
    else setReportError(r.code);
  }, [period]);

  useEffect(() => {
    if (account.status === 'loading') return;
    if (account.status !== 'user') {
      setDenied(true);
      return;
    }
    void loadReport();
  }, [account.status, loadReport, version]);

  useEffect(() => {
    if (denied || account.status !== 'user') return;
    void staffApi.games().then((r) => {
      if (r.ok) {
        setGames(r.data);
        setGamesError(null);
      } else setGamesError(r.code);
    });
  }, [denied, account.status, version]);

  // Presence ("online") changes slowly; a calm refresh once a minute is enough.
  useEffect(() => {
    if (denied) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void loadReport();
    }, 60000);
    return () => window.clearInterval(id);
  }, [denied, loadReport]);

  // Live: audit entries, balances and bans (RLS lets only staff receive other players' rows).
  useEffect(() => {
    const cfg = onlineConfig();
    if (!cfg || denied || account.status !== 'user' || ROLE_RANK[myRole] < 1) return;
    const feed = createStaffFeed({
      subscribe: (onChange) =>
        subscribeLive(cfg, 'staff-dashboard', [{ table: 'admin_audit', event: 'INSERT' }, { table: 'account_wallets' }, { table: 'account_bans' }], onChange, setLive),
      onRefresh: refresh,
    });
    void feed.start().catch(() => setLive(false));
    return () => feed.stop();
  }, [denied, account.status, myRole, refresh]);

  const go = (s: Section) => {
    setSection(s);
    if (s !== 'games') setOpenGame(null);
    window.scrollTo({ top: 0 });
  };
  const openLedgerGame = (code: string) => {
    const g = gameOfLedger(code);
    setOpenGame(g === 'crash' || g === 'horse' ? g : null);
    go('games');
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    setQuery(headerQuery);
    go('users');
  };

  if (denied) {
    return (
      <div className="sd">
        <div className="sd-deny sd-panel" role="alert">
          <ShieldX className="w-10 h-10 mx-auto text-[#ffb3b3]" aria-hidden />
          <h1 className="sd-h mt-3">{t('staff.denied')}</h1>
          <p className="text-sm sd-muted mt-2">{t('staff.deniedText')}</p>
          <button type="button" className="cz-btn cz-btn-primary mt-5" onClick={() => back('home')}>
            {t('staff.backHome')}
          </button>
        </div>
      </div>
    );
  }

  const off = games ? CONTROLLED_GAMES.filter((g) => !games[g]).length : 0;
  const badge: Partial<Record<Section, number>> = { games: off, bans: Number(report?.banned ?? 0) };

  return (
    <div className="sd">
      <header className="sd-top">
        <button type="button" className="cz-btn cz-btn-quiet cz-icon-btn" onClick={() => back('account')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1 sm:flex-none">
          <h1 className="sd-h truncate">{t('staff.title')}</h1>
          <span className={`sd-live ${live ? 'on' : ''}`}>
            <i aria-hidden /> {t(live ? 'staff.liveOn' : 'staff.liveOff')}
          </span>
        </div>
        <form className="sd-top-search" onSubmit={search} role="search">
          <Search className="w-4 h-4" aria-hidden />
          <input type="search" value={headerQuery} onChange={(e) => setHeaderQuery(e.target.value)} placeholder={t('staff.searchPlaceholder')} aria-label={t('staff.search')} />
        </form>
        <button
          type="button"
          className="cz-btn cz-btn-quiet cz-icon-btn"
          onClick={() => {
            setRefreshing(true);
            refresh();
          }}
          aria-label={t('staff.refresh')}
          title={t('staff.refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <RoleBadge role={myRole} />
      </header>
      <div className="sd-body">
        <nav className="sd-nav" aria-label={t('staff.title')}>
          {SECTIONS.map(({ id, icon: Icon }) => (
            <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon className="w-4 h-4" aria-hidden />
              <span>{t(`staff.tabs.${id}`)}</span>
              {!!badge[id] && <em className="sd-nav-badge">{badge[id]}</em>}
            </button>
          ))}
        </nav>
        <main className="sd-main">
          {section === 'overview' && (
            <OverviewTab report={report} reportError={reportError} games={games} period={period} onPeriod={setPeriod} version={version} role={myRole} go={go} onOpen={setSelected} onGame={openLedgerGame} />
          )}
          {section === 'users' && <PlayersTab version={version} onOpen={setSelected} selected={selected} query={query} onQuery={setQuery} />}
          {section === 'games' && (
            <GamesTab games={games} gamesError={gamesError} report={report} period={period} onPeriod={setPeriod} open={openGame} onOpenGame={setOpenGame} version={version} role={myRole} onChanged={refresh} onOpen={setSelected} />
          )}
          {section === 'economy' && <EconomyTab report={report} reportError={reportError} period={period} onPeriod={setPeriod} version={version} role={myRole} onChanged={refresh} onOpen={setSelected} />}
          {section === 'bans' && <BansTab version={version} onOpen={setSelected} />}
          {section === 'audit' && <AuditTab version={version} onOpen={setSelected} />}
        </main>
      </div>
      {selected && <UserDetailPanel userId={selected} myRole={myRole} myId={myId} version={version} onClose={() => setSelected(null)} onChanged={refresh} />}
    </div>
  );
}
