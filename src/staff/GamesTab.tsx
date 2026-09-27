// Staff → Games: every game on one screen with its state (in service or not), its numbers for the period, the
// owner's on/off switch, and a full panel for the games that have one (Crash, Horse Racing).
// The switch is the database function owner_set_game_enabled, which checks the owner role itself and writes the
// audit log; a hidden button would protect nothing.
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Power } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Role } from '@/account/accountContext';
import { CONTROLLED_GAMES, setAvailability } from '@/games/availability';
import type { Availability, ControlledGame } from '@/games/availability';
import { staffApi } from './api';
import type { StaffReport } from './api';
import { CrashAdmin } from './CrashAdmin';
import { HorseAdmin } from './HorseAdmin';
import { fmtNum, signed } from './format';
import { ErrorLine, PeriodPicker } from './ui';
import { GAME_LEDGER, rtpText } from './lib';
import type { Period } from './lib';

const PANELS: ControlledGame[] = ['crash', 'horse'];

export function GamesTab({
  games,
  gamesError,
  report,
  period,
  onPeriod,
  open,
  onOpenGame,
  version,
  role,
  onChanged,
  onOpen,
}: {
  games: Availability | null;
  gamesError: string | null;
  report: StaffReport | null;
  period: Period;
  onPeriod: (p: Period) => void;
  open: ControlledGame | null;
  onOpenGame: (g: ControlledGame | null) => void;
  version: number;
  role: Role;
  onChanged: () => void;
  onOpen: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const isOwner = role === 'owner';
  const [editing, setEditing] = useState<ControlledGame | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (game: ControlledGame, enabled: boolean) => {
    setBusy(true);
    setError(null);
    const r = await staffApi.setGame(game, enabled, reason.trim());
    setBusy(false);
    if (!r.ok) return setError(r.code);
    if (games) setAvailability({ ...games, [game]: enabled });
    setEditing(null);
    setReason('');
    onChanged();
  };

  if (open && PANELS.includes(open)) {
    return (
      <>
        <div className="flex items-center gap-2">
          <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={() => onOpenGame(null)}>
            <ChevronLeft className="w-4 h-4" aria-hidden /> {t('staff.tabs.games')}
          </button>
          <h2 className="sd-h flex-1 min-w-0 truncate">{t(`availability.games.${open}`)}</h2>
          {games && <StatePill on={games[open]} />}
        </div>
        {open === 'crash' ? <CrashAdmin version={version} onOpen={onOpen} /> : <HorseAdmin version={version} role={role} onChanged={onChanged} onOpen={onOpen} />}
      </>
    );
  }

  const stats = (g: ControlledGame) => {
    const rows = GAME_LEDGER[g].map((c) => report?.byGame?.[c]).filter(Boolean) as { rounds: number; players: number; staked: number; paid: number }[];
    return rows.reduce((a, b) => ({ rounds: a.rounds + Number(b.rounds), players: Math.max(a.players, Number(b.players)), staked: a.staked + Number(b.staked), paid: a.paid + Number(b.paid) }), { rounds: 0, players: 0, staked: 0, paid: 0 });
  };

  return (
    <>
      <div className="sd-title-row">
        <h2 className="sd-h">{t('staff.tabs.games')}</h2>
        <PeriodPicker value={period} onChange={onPeriod} />
      </div>
      <p className="sd-muted text-xs">{t(isOwner ? 'staff.games.noteOwner' : 'staff.games.noteStaff')}</p>
      <ErrorLine code={gamesError} />
      <ErrorLine code={error} />
      <div className="sd-game-grid">
        {CONTROLLED_GAMES.map((g) => {
          const on = games ? games[g] : null;
          const s = stats(g);
          const coins = GAME_LEDGER[g].length > 0;
          return (
            <article key={g} className={`sd-game ${on === false ? 'is-off' : ''}`}>
              <header className="flex items-center gap-2">
                <h3 className="flex-1 min-w-0 truncate">{t(`availability.games.${g}`)}</h3>
                {on !== null && <StatePill on={on} />}
              </header>
              {coins ? (
                <dl className="sd-game-stats">
                  <div>
                    <dt>{t('staff.kpi.bets')}</dt>
                    <dd className="cz-num">{report ? fmtNum(s.rounds, language) : '…'}</dd>
                  </div>
                  <div>
                    <dt>{t('staff.money.staked')}</dt>
                    <dd className="cz-num">{report ? fmtNum(s.staked, language) : '…'}</dd>
                  </div>
                  <div>
                    <dt>{t('staff.money.house')}</dt>
                    <dd className={`cz-num ${s.staked - s.paid < 0 ? 'sd-minus' : ''}`}>{report ? signed(s.staked - s.paid, language) : '…'}</dd>
                  </div>
                  <div>
                    <dt>{t('staff.money.rtpShort')}</dt>
                    <dd className="cz-num">{report ? rtpText(s.paid, s.staked) : '…'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="sd-muted text-xs">{t('staff.games.noCoins')}</p>
              )}
              <div className="flex gap-2 flex-wrap mt-auto">
                {PANELS.includes(g) && (
                  <button type="button" className="cz-btn cz-btn-secondary cz-btn-sm" onClick={() => onOpenGame(g)}>
                    {t('staff.games.openPanel')} <ChevronRight className="w-4 h-4" aria-hidden />
                  </button>
                )}
                {isOwner && on !== null && editing !== g && (
                  <button type="button" className={`cz-btn ${on ? 'cz-btn-quiet' : 'cz-btn-primary'} cz-btn-sm`} onClick={() => { setEditing(g); setReason(''); setError(null); }}>
                    <Power className="w-4 h-4" aria-hidden /> {t(on ? 'staff.games.turnOff' : 'staff.games.turnOn')}
                  </button>
                )}
              </div>
              {isOwner && on !== null && editing === g && (
                <div className="flex flex-col gap-2">
                  <textarea className="sd-textarea" placeholder={t('staff.games.reasonPlaceholder')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label={t('staff.reason')} required />
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className={`cz-btn ${on ? 'cz-btn-secondary !border-[rgba(224,122,122,0.6)] !text-[#ffd0d0]' : 'cz-btn-primary'} cz-btn-sm`} disabled={busy || reason.trim().length < 3} onClick={() => void apply(g, !on)}>
                      {t(on ? 'staff.games.confirmOff' : 'staff.games.confirmOn')}
                    </button>
                    <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm" onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function StatePill({ on }: { on: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`sd-state ${on ? 'is-on' : 'is-off'}`} role="status">
      <i aria-hidden /> {t(on ? 'staff.games.on' : 'staff.games.off')}
    </span>
  );
}
