// CRASH, a native Carta Casino game: the shared casino frame (top bar with the coins, rules, music; controls in
// the dock), the rocket stage, and the round's bets. Account coins only: the database takes the bets, keeps
// the clock, pays the cash-outs and draws the crash point. Guests can watch and are invited to sign up.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Minus, Plus, Rocket, UserRound } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { RulesSheet } from '@/components/casino/RulesSheet';
import { Toggle } from '@/components/ui/Toggle';
import { FairPanel } from '@/casino/table/FairPanel';
import '@/casino/table/table.css';
import { formatChips } from '@/casino/chipValues';
import { useAccount } from '@/account/useAccount';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { storage } from '@/storage';
import { MAX_AUTO, MAX_BET, MIN_AUTO, MIN_BET, multiplierAt, verifyCrash } from '../fair';
import type { CrashRevealed } from '../fair';
import { myBets } from '../api';
import type { CrashState, MyCrashBet } from '../api';
import { phaseOf, useCrash } from '../useCrash';
import type { CrashPhase } from '../useCrash';
import { crashSounds } from '../sounds';
import { CrashStage } from './CrashStage';
import bgPortrait from '../assets/bg-portrait.webp';
import bgLandscape from '../assets/bg-landscape.webp';
import './crash.css';

const PRESETS = [100, 500, 1000, 2500, 5000];
const AMOUNT_STEPS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const AUTO_STEPS = [1.1, 1.25, 1.5, 2, 2.5, 3, 5, 10, 20, 50, 100, 250, 500, 1000];
const PREFS_KEY = 'crash.prefs';

const step = (list: number[], value: number, dir: 1 | -1) => {
  if (dir > 0) return list.find((v) => v > value + 1e-9) ?? list[list.length - 1];
  return [...list].reverse().find((v) => v < value - 1e-9) ?? list[0];
};
const x = (m: number) => `${m.toFixed(2)}×`;
const tone = (m: number) => (m < 2 ? 'is-low' : m < 10 ? 'is-mid' : 'is-high');

/** The phase, re-read from the database clock a few times a second (flying starts on time, not on a poll). */
function usePhase(state: CrashState | null, serverNow: () => number): CrashPhase | null {
  const [phase, setPhase] = useState<CrashPhase | null>(null);
  useEffect(() => {
    if (!state) return;
    const upd = () => setPhase(phaseOf(state.round, serverNow()));
    upd();
    const id = window.setInterval(upd, 100);
    return () => window.clearInterval(id);
  }, [state, serverNow]);
  return phase;
}

/** The live multiplier for the cash-out button (10 updates a second is plenty for a label). */
function useLiveMultiplier(active: boolean, startsAt: number, serverNow: () => number): number {
  const [m, setM] = useState(1);
  useEffect(() => {
    if (!active) return;
    const upd = () => setM(multiplierAt((serverNow() - startsAt) / 1000));
    upd();
    const id = window.setInterval(upd, 100);
    return () => window.clearInterval(id);
  }, [active, startsAt, serverNow]);
  return m;
}

export function CrashScreen() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const reduced = useReducedMotion();
  useGameMusic('crash');
  const game = useCrash();
  const { state, serverNow } = game;
  const phase = usePhase(state, serverNow);
  const saved = useMemo(() => storage.get<{ amount?: number; auto?: number; autoOn?: boolean }>(PREFS_KEY) ?? {}, []);
  const [amount, setAmount] = useState(() => Math.min(MAX_BET, Math.max(MIN_BET, Math.round(saved.amount ?? 1000))));
  const [auto, setAuto] = useState(() => Math.min(MAX_AUTO, Math.max(MIN_AUTO, saved.auto ?? 2)));
  const [autoOn, setAutoOn] = useState(saved.autoOn === true);
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<'bets' | 'mine'>('bets');
  const [history, setHistory] = useState<MyCrashBet[]>([]);
  const signedIn = account.status === 'user';

  useEffect(() => {
    storage.set(PREFS_KEY, { amount, auto, autoOn });
  }, [amount, auto, autoOn]);

  const round = state?.round;
  const mine = state?.mine ?? null;
  const cashedHere = game.cashed && round && game.cashed.round === round.id ? game.cashed : null;
  const flying = phase === 'flying';
  const live = useLiveMultiplier(flying && !!mine && mine.status === 'placed', round?.startsAt ?? 0, serverNow);
  // An automatic target already passed: shown as cashed at once (the database pays it on its next step).
  const autoHit = flying && mine?.status === 'placed' && mine.auto !== null && live >= mine.auto;
  const cashedAt = mine?.status === 'cashed' ? mine.cashout : cashedHere ? cashedHere.multiplier : autoHit ? mine?.auto ?? null : null;

  // Coins when a cash-out lands (the manual one plays on click; the automatic one when the server confirms).
  const lastStatus = useRef<{ round: number; status: string } | null>(null);
  useEffect(() => {
    if (!round || !mine) return;
    const prev = lastStatus.current;
    if (prev && prev.round === round.id && prev.status === 'placed' && mine.status === 'cashed' && !cashedHere) {
      crashSounds.cashout();
      if ((mine.cashout ?? 0) >= 10) crashSounds.win();
    }
    lastStatus.current = { round: round.id, status: mine.status };
  }, [round, mine, cashedHere]);

  // "My bets": loaded when the tab opens and after each round.
  useEffect(() => {
    if (tab !== 'mine' || !signedIn) return;
    let live = true;
    void myBets().then((b) => live && setHistory(b));
    return () => {
      live = false;
    };
  }, [tab, signedIn, round?.id, round?.crashed]);

  const onBet = async () => {
    await game.bet(amount, autoOn ? auto : null);
  };
  const onCashout = async () => {
    const ok = await game.cashout();
    if (ok) {
      crashSounds.cashout();
      if (live >= 10) crashSounds.win();
    }
  };

  const balance = account.coins?.balance ?? null;
  const canBet = signedIn && state?.enabled !== false && (phase === 'betting' || phase === 'countdown') && !mine && !game.betting && (balance === null || balance >= amount);

  let main: React.ReactNode;
  if (!signedIn) {
    main = (
      <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full cr-main-btn" onClick={() => navigate('account')}>
        <UserRound className="w-5 h-5" aria-hidden />
        {t('crash.signIn')}
      </button>
    );
  } else if (mine && (mine.status === 'cashed' || cashedHere || autoHit)) {
    const m = mine.cashout ?? cashedHere?.multiplier ?? mine.auto ?? 1;
    const paid = mine.payout ?? cashedHere?.payout ?? Math.floor(mine.amount * m);
    main = (
      <button type="button" className="cz-btn cz-btn-lg w-full cr-main-btn is-cashed" disabled>
        {t('crash.cashedOut', { x: x(m), coins: formatChips(paid) })}
      </button>
    );
  } else if (mine && flying && mine.status === 'placed') {
    main = (
      <button type="button" className="cz-btn cz-btn-lg w-full cr-main-btn is-cashout" onClick={onCashout} disabled={game.cashing}>
        <span>{t('crash.cashOutNow')}</span>
        <span className="cr-coins">🪙 {formatChips(Math.floor(mine.amount * live))}</span>
      </button>
    );
  } else if (mine && phase === 'crashed') {
    main = (
      <button type="button" className="cz-btn cz-btn-lg w-full cr-main-btn is-lost" disabled>
        {t('crash.lost', { coins: formatChips(mine.amount) })}
      </button>
    );
  } else if (mine) {
    main = (
      <button type="button" className="cz-btn cz-btn-lg w-full cr-main-btn is-waiting" disabled>
        {t('crash.betPlaced', { coins: formatChips(mine.amount) })}
      </button>
    );
  } else if (phase === 'flying' || phase === 'crashed') {
    main = (
      <button type="button" className="cz-btn cz-btn-lg w-full cr-main-btn is-waiting" disabled>
        {phase === 'crashed' ? t('crash.nextRound') : t('crash.waitNext')}
      </button>
    );
  } else {
    main = (
      <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full cr-main-btn" onClick={onBet} disabled={!canBet}>
        <Rocket className="w-5 h-5" aria-hidden />
        {game.betting ? t('crash.placing') : t('crash.placeBet', { coins: formatChips(amount) })}
      </button>
    );
  }

  const locked = !signedIn || !!mine || phase === 'flying';
  const dock = (
    <div className="cr-dock">
      <div className="cr-field cr-amount">
        <span className="cz-label">{t('crash.amount')}</span>
        <div className="cr-stepper">
          <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setAmount((a) => step(AMOUNT_STEPS, a, -1))} disabled={locked || amount <= MIN_BET} aria-label={t('crash.less')}>
            <Minus className="w-4 h-4" />
          </button>
          <output className="cr-value">🪙 {formatChips(amount)}</output>
          <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setAmount((a) => step(AMOUNT_STEPS, a, 1))} disabled={locked || amount >= MAX_BET} aria-label={t('crash.more')}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="cr-presets">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`cr-preset ${amount === p ? 'is-on' : ''}`} onClick={() => setAmount(p)} disabled={locked}>
              {formatChips(p)}
            </button>
          ))}
        </div>
      </div>
      <div className="cr-field cr-auto">
        <span className="cr-auto-head">
          <span className="cz-label">{t('crash.autoCashout')}</span>
          <Toggle checked={autoOn} onChange={setAutoOn} label={t('crash.autoCashout')} />
        </span>
        <div className={`cr-stepper ${autoOn ? '' : 'is-off'}`}>
          <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setAuto((a) => step(AUTO_STEPS, a, -1))} disabled={locked || !autoOn || auto <= MIN_AUTO} aria-label={t('crash.less')}>
            <Minus className="w-4 h-4" />
          </button>
          <output className="cr-value">{x(auto)}</output>
          <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setAuto((a) => step(AUTO_STEPS, a, 1))} disabled={locked || !autoOn || auto >= MAX_AUTO} aria-label={t('crash.more')}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="cr-hint">{autoOn ? t('crash.autoHint', { x: x(auto), coins: formatChips(Math.floor(amount * auto)) }) : t('crash.autoOff')}</p>
      </div>
      <div className="cr-action">{main}</div>
    </div>
  );

  const errKey = game.error ? `crash.errors.${game.error}` : null;
  const errorText = errKey ? (t(errKey) === errKey ? t('crash.errors.server') : t(errKey)) : null;
  const revealed: CrashRevealed | null = round?.crashed && round.seed && round.crash !== null ? { round: round.id, seed: round.seed, hash: round.hash, crash: round.crash } : null;

  return (
    <CasinoFrame
      title={t('crash.title')}
      subtitle={t('crash.subtitle')}
      back="home"
      scenario="lounge"
      backdrop={<div className="cr-backdrop" style={{ '--cr-bg-p': `url(${bgPortrait})`, '--cr-bg-l': `url(${bgLandscape})` } as CSSProperties} />}
      onHelp={() => setHelp(true)}
      dock={dock}
      maxWidth="max-w-6xl"
      allowRefill={false}
      error={errorText ?? (state?.enabled === false ? t('crash.disabled') : game.offline && !game.loading ? t('crash.offline') : null)}
    >
      <div className="cr-layout">
        <section className="cr-main" aria-label={t('crash.title')}>
          <div className="cr-roundbar">
            <span className="cr-round">{round ? t('crash.round', { n: String(round.id).padStart(8, '0') }) : t('crash.loading')}</span>
            {phase && <span className={`cr-chip is-${phase}`}>{t(`crash.phase.${phase}`)}</span>}
            <span className="cr-players">{t('crash.players', { n: state?.players ?? 0 })}</span>
          </div>
          <div className="cr-history" aria-label={t('crash.history')}>
            {(state?.history ?? []).map((h) => (
              <span key={h.id} className={`cr-pill ${tone(h.crash)}`}>
                {x(h.crash)}
              </span>
            ))}
          </div>
          {round && phase ? (
            <CrashStage round={round} phase={phase} serverNow={serverNow} cashedAt={cashedAt} reduced={reduced} />
          ) : (
            <div className="cr-stage is-loading">
              <span className="cr-state">{game.offline && !game.loading ? t('crash.offline') : t('crash.loading')}</span>
            </div>
          )}
          {!signedIn && <p className="cr-guest">{t('crash.guest')}</p>}
        </section>

        <aside className="cr-side">
          <div className="cz-panel cr-bets">
            <div className="cz-seg cr-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'bets'} className={tab === 'bets' ? 'is-active' : ''} onClick={() => setTab('bets')}>
                {t('crash.bets')}
              </button>
              <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')} disabled={!signedIn}>
                {t('crash.myBets')}
              </button>
            </div>
            {tab === 'bets' ? (
              <table className="cr-table">
                <thead>
                  <tr>
                    <th>{t('crash.col.player')}</th>
                    <th>{t('crash.col.bet')}</th>
                    <th>{t('crash.col.cashout')}</th>
                    <th>{t('crash.col.win')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(state?.bets ?? []).map((b, i) => (
                    <tr key={`${b.name}-${i}`} className={`${b.me ? 'is-me' : ''} is-${b.status}`}>
                      <td>{b.name}</td>
                      <td>{formatChips(b.amount)}</td>
                      <td>{b.cashout !== null ? x(b.cashout) : b.status === 'lost' ? '—' : '…'}</td>
                      <td>{b.payout !== null ? `+${formatChips(b.payout)}` : b.status === 'lost' ? `−${formatChips(b.amount)}` : ''}</td>
                    </tr>
                  ))}
                  {(state?.bets ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="cr-empty">
                        {t('crash.noBets')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="cr-table">
                <thead>
                  <tr>
                    <th>{t('crash.col.round')}</th>
                    <th>{t('crash.col.bet')}</th>
                    <th>{t('crash.col.cashout')}</th>
                    <th>{t('crash.col.win')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((b) => (
                    <tr key={b.round} className={`is-${b.status}`}>
                      <td>#{b.round}</td>
                      <td>{formatChips(b.amount)}</td>
                      <td>{b.cashout !== null ? x(b.cashout) : b.crash !== null ? `💥 ${x(b.crash)}` : '…'}</td>
                      <td>{b.payout !== null ? `+${formatChips(b.payout)}` : b.status === 'lost' ? `−${formatChips(b.amount)}` : ''}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={4} className="cr-empty">
                        {t('crash.noMyBets')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          {round && <FairPanel fair={{ round: round.id, hash: round.hash, revealed }} verify={verifyCrash} detail={(r) => t('crash.fairDetail', { x: x(r.crash) })} />}
        </aside>
      </div>

      {help && <RulesSheet title={t('crash.helpTitle')} items={['how', 'cashout', 'auto', 'crash', 'fair', 'coins'].map((k) => t(`crash.help.${k}`))} onClose={() => setHelp(false)} />}
    </CasinoFrame>
  );
}
