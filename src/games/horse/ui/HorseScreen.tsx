// CARTA HORSE RACING, a native Carta Casino game on the shared casino frame (top bar with coins, rules and music;
// controls in the dock). Pick a horse, bet, watch the race the database built, see the podium. Account coins only;
// the database takes the bets, closes them on time and pays the winners. Guests can watch and are invited to sign up.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, Minus, Plus, Trophy, UserRound } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { RulesSheet } from '@/components/casino/RulesSheet';
import { FairPanel } from '@/casino/table/FairPanel';
import '@/casino/table/table.css';
import { formatChips } from '@/casino/chipValues';
import { useAccount } from '@/account/useAccount';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useGameMusic } from '@/games/shared/useGameMusic';
import { storage } from '@/storage';
import { myHorseBets } from '../api';
import type { HorseState, MyHorseBet } from '../api';
import { verifyRace } from '../fair';
import type { HorseRevealed } from '../fair';
import { lookOf } from '../stable';
import { HORSE_ART } from '../assets';
import { COUNTDOWN_MS, racePhase, useHorseRace } from '../useHorseRace';
import type { RacePhase } from '../useHorseRace';
import { horseSounds } from '../sounds';
import { HorseTrack } from './HorseTrack';
import './horse.css';

const PRESETS = [100, 500, 1000, 2500, 5000];
const STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const PREFS_KEY = 'horse.prefs';
const odds = (o: number) => `${(o / 100).toFixed(2)}×`;

/** The horse's painted portrait, or a silk medallion with its number until the art exists. */
export function HorseBadge({ n, size = 44 }: { n: number; size?: number }) {
  const look = lookOf(n);
  const src = HORSE_ART.portrait(n);
  return (
    <span className="hr-badge" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), '--silk': look.silk, '--silk2': look.silk2 } as CSSProperties}>
      {src ? <img src={src} alt="" draggable={false} /> : <b>{n}</b>}
    </span>
  );
}

function usePhase(state: HorseState | null, serverNow: () => number): RacePhase | null {
  const [phase, setPhase] = useState<RacePhase | null>(null);
  useEffect(() => {
    if (!state) return;
    const upd = () => setPhase(racePhase(state.race, serverNow()));
    upd();
    const id = window.setInterval(upd, 100);
    return () => window.clearInterval(id);
  }, [state, serverNow]);
  return phase;
}

export function HorseScreen() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const account = useAccount();
  const reduced = useReducedMotion();
  useGameMusic('horse');
  const game = useHorseRace();
  const { state, serverNow } = game;
  const phase = usePhase(state, serverNow);
  const race = state?.race ?? null;
  const mine = state?.mine ?? null;
  const signedIn = account.status === 'user';
  const saved = useMemo(() => storage.get<{ amount?: number }>(PREFS_KEY) ?? {}, []);
  const [amount, setAmount] = useState(() => Math.max(10, Math.round(saved.amount ?? 1000)));
  const [pick, setPick] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<'bets' | 'mine'>('bets');
  const [history, setHistory] = useState<MyHorseBet[]>([]);
  const [ranks, setRanks] = useState<number[]>([]);
  const name = (n: number) => t(`horse.names.${n}`);

  useEffect(() => {
    storage.set(PREFS_KEY, { amount });
  }, [amount]);

  // The chosen horse belongs to one race; the amount stays within that race's limits.
  const raceId = race?.id ?? 0;
  useEffect(() => {
    setPick(null);
    setRanks([]);
  }, [raceId]);
  const minBet = race?.minBet ?? 10;
  const maxBet = race?.maxBet ?? 100000;
  const bet = Math.min(maxBet, Math.max(minBet, amount));

  // The call to post when a new race opens; win or lose when the result lands.
  const heard = useRef<{ race: number; bugle: boolean; result: boolean }>({ race: 0, bugle: false, result: false });
  useEffect(() => {
    if (!race || !phase) return;
    if (heard.current.race !== race.id) heard.current = { race: race.id, bugle: false, result: false };
    if (phase === 'betting' && !heard.current.bugle) {
      heard.current.bugle = true;
      horseSounds.bugle();
    }
    if (phase === 'result' && race.order && !heard.current.result) {
      heard.current.result = true;
      if (mine) (mine.horse === race.order[0] ? horseSounds.win : horseSounds.lose)();
    }
  }, [race, phase, mine]);

  // "My bets": when the tab opens and after each race.
  useEffect(() => {
    if (tab !== 'mine' || !signedIn) return;
    let live = true;
    void myHorseBets().then((b) => live && setHistory(b));
    return () => {
      live = false;
    };
  }, [tab, signedIn, raceId, race?.finished]);

  // Seconds left to pick and bet (the gold bar).
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (phase !== 'betting' || !race) return;
    const upd = () => setLeft(Math.max(0, race.startsAt - COUNTDOWN_MS - serverNow()));
    upd();
    const id = window.setInterval(upd, 250);
    return () => window.clearInterval(id);
  }, [phase, race, serverNow]);

  const open = phase === 'betting' || phase === 'countdown';
  const selected = mine?.horse ?? pick;
  const runner = race?.runners.find((r) => r.horse === selected) ?? null;
  const balance = account.coins?.balance ?? null;
  const canBet = signedIn && state?.enabled !== false && open && !mine && !!runner && !game.betting && (balance === null || balance >= bet);

  const onBet = async () => {
    if (!runner) return;
    if (await game.bet(runner.horse, bet)) horseSounds.chip();
  };

  let main: React.ReactNode;
  if (!signedIn) {
    main = (
      <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full hr-main-btn" onClick={() => navigate('account')}>
        <UserRound className="w-5 h-5" aria-hidden />
        {t('horse.signIn')}
      </button>
    );
  } else if (mine && phase === 'result' && race?.order) {
    const won = mine.horse === race.order[0];
    main = (
      <button type="button" className={`cz-btn cz-btn-lg w-full hr-main-btn ${won ? 'is-won' : 'is-lost'}`} disabled>
        {won ? t('horse.youWon', { coins: formatChips(mine.payout ?? Math.floor((mine.amount * mine.odds) / 100)) }) : t('horse.youLost', { n: race.order[0] })}
      </button>
    );
  } else if (mine) {
    main = (
      <button type="button" className="cz-btn cz-btn-lg w-full hr-main-btn is-waiting" disabled>
        {phase === 'racing' ? t('horse.racingYours', { n: mine.horse }) : t('horse.betPlaced', { n: mine.horse, coins: formatChips(mine.amount), pays: formatChips(Math.floor((mine.amount * mine.odds) / 100)) })}
      </button>
    );
  } else if (!open) {
    main = (
      <button type="button" className="cz-btn cz-btn-lg w-full hr-main-btn is-waiting" disabled>
        {phase === 'result' ? t('horse.nextRace') : t('horse.waitNext')}
      </button>
    );
  } else {
    main = (
      <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full hr-main-btn" onClick={onBet} disabled={!canBet}>
        {game.betting ? t('horse.placing') : runner ? t('horse.confirm', { n: runner.horse, coins: formatChips(bet) }) : t('horse.pickFirst')}
      </button>
    );
  }

  const locked = !signedIn || !!mine || !open;
  const dock = (
    <div className="hr-dock">
      <div className="hr-dock-row">
        <div className="hr-choice">
          {runner ? (
            <>
              <HorseBadge n={runner.horse} size={38} />
              <span className="min-w-0">
                <b className="hr-choice-name">
                  #{runner.horse} {name(runner.horse)}
                </b>
                <small>
                  {t('horse.odds')} {odds(runner.odds)} · {t('horse.pays')} 🪙 {formatChips(Math.floor((bet * runner.odds) / 100))}
                </small>
              </span>
            </>
          ) : (
            <span className="hr-choice-empty">{open ? t('horse.pickHint') : t('horse.pickLater')}</span>
          )}
        </div>
        <div className="hr-field">
          <span className="cz-label">{t('horse.amount')}</span>
          <div className="hr-stepper">
            <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setAmount(() => [...STEPS].reverse().find((v) => v < bet && v >= minBet) ?? minBet)} disabled={locked || bet <= minBet} aria-label={t('horse.less')}>
              <Minus className="w-4 h-4" />
            </button>
            <output className="hr-value">🪙 {formatChips(bet)}</output>
            <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => setAmount(() => STEPS.find((v) => v > bet && v <= maxBet) ?? maxBet)} disabled={locked || bet >= maxBet} aria-label={t('horse.more')}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="hr-presets">
        {PRESETS.filter((p) => p >= minBet && p <= maxBet).map((p) => (
          <button key={p} type="button" className={`hr-preset ${bet === p ? 'is-on' : ''}`} onClick={() => setAmount(p)} disabled={locked}>
            {formatChips(p)}
          </button>
        ))}
      </div>
      {main}
    </div>
  );

  const errKey = game.error ? `horse.errors.${game.error}` : null;
  const errorText = errKey ? (t(errKey) === errKey ? t('horse.errors.server') : t(errKey)) : null;
  const revealed: HorseRevealed | null =
    race?.finished && race.seed && race.order ? { round: race.id, seed: race.seed, hash: race.hash, rtp: race.rtp, runners: race.runners, order: race.order } : null;
  const podium = race?.order ?? null;
  const winner = podium ? race?.runners.find((r) => r.horse === podium[0]) : null;
  const bg = { '--hr-bg-p': HORSE_ART.backgroundPortrait ? `url(${HORSE_ART.backgroundPortrait})` : 'none', '--hr-bg-l': HORSE_ART.backgroundLandscape ? `url(${HORSE_ART.backgroundLandscape})` : 'none' } as CSSProperties;
  const labels = useMemo(() => ({ start: t('horse.start'), finish: t('horse.finish'), go: t('horse.go') }), [t]);

  return (
    <CasinoFrame
      title={t('horse.title')}
      subtitle={t('horse.subtitle')}
      back="home"
      scenario="lounge"
      backdrop={<div className="hr-backdrop" style={bg} />}
      onHelp={() => setHelp(true)}
      dock={dock}
      maxWidth="max-w-6xl"
      allowRefill={false}
      error={errorText ?? (state?.enabled === false ? t('horse.disabled') : game.offline && !game.loading ? t('horse.offline') : null)}
    >
      <div className="hr-layout">
        <section className="hr-main" aria-label={t('horse.title')}>
          <div className="hr-roundbar">
            <span className="hr-round">{race ? t('horse.race', { n: String(race.id).padStart(6, '0') }) : t('horse.loading')}</span>
            {phase && <span className={`hr-chip is-${phase}`}>{t(`horse.phase.${phase}`)}</span>}
            <span className="hr-players">{t('horse.players', { n: state?.players ?? 0 })}</span>
          </div>
          <div className="hr-history" aria-label={t('horse.history')}>
            {(state?.history ?? []).map((h) => (
              <span key={h.id} className="hr-pill" style={{ '--silk': lookOf(h.horse).silk } as CSSProperties}>
                <i>{h.horse}</i> {odds(h.odds)}
              </span>
            ))}
          </div>
          <div className="hr-stage">
            {race && phase ? (
              <HorseTrack race={race} phase={phase} serverNow={serverNow} mine={mine?.horse ?? null} reduced={reduced} labels={labels} onRanks={setRanks} grandstand={HORSE_ART.grandstand} turf={HORSE_ART.turf} finishPost={HORSE_ART.finishPost} />
            ) : (
              <div className="hr-track is-loading">
                <span className="hr-state">{game.offline && !game.loading ? t('horse.offline') : t('horse.loading')}</span>
              </div>
            )}
            {phase === 'betting' && race && (
              <div className="hr-banner">
                <span className="hr-state">{t('horse.nextRaceTitle')}</span>
                <span className="hr-bar" style={{ '--p': `${Math.min(100, (left / (25000 - COUNTDOWN_MS)) * 100)}%` } as CSSProperties} />
              </div>
            )}
            {phase === 'result' && podium && winner && (
              <div className="hr-result" role="status">
                {HORSE_ART.trophy ? <img src={HORSE_ART.trophy} alt="" className="hr-trophy" /> : <Trophy className="hr-trophy-icon" aria-hidden />}
                <span className="hr-result-kicker">{t('horse.winner')}</span>
                <div className="hr-result-winner">
                  <HorseBadge n={winner.horse} size={64} />
                  <span>
                    <b>{t('horse.horseN', { n: winner.horse })}</b>
                    <strong>{name(winner.horse)}</strong>
                    <small>
                      {t('horse.odds')} {odds(winner.odds)}
                    </small>
                  </span>
                </div>
                <ol className="hr-podium">
                  {podium.slice(0, 3).map((h, i) => (
                    <li key={h}>
                      <span>{['🥇', '🥈', '🥉'][i]}</span>
                      <HorseBadge n={h} size={26} />
                      <em>
                        #{h} {name(h)}
                      </em>
                    </li>
                  ))}
                </ol>
                {mine && (
                  <p className={`hr-result-mine ${mine.horse === podium[0] ? 'is-won' : 'is-lost'}`}>
                    {mine.horse === podium[0]
                      ? t('horse.resultWon', { coins: formatChips(mine.amount), odds: odds(mine.odds), win: formatChips(mine.payout ?? Math.floor((mine.amount * mine.odds) / 100)) })
                      : t('horse.resultLost', { coins: formatChips(mine.amount), n: mine.horse })}
                  </p>
                )}
              </div>
            )}
          </div>
          {phase === 'racing' && ranks.length > 0 && (
            <ol className="hr-ranks" aria-label={t('horse.positions')}>
              {ranks.map((h, i) => (
                <li key={h} className={mine?.horse === h ? 'is-mine' : ''} style={{ '--silk': lookOf(h).silk } as CSSProperties}>
                  <small>{i + 1}</small>
                  <i>{h}</i>
                </li>
              ))}
            </ol>
          )}
          {!signedIn && <p className="hr-guest">{t('horse.guest')}</p>}
        </section>

        <aside className="hr-side">
          <div className="cz-panel hr-runners">
            <h2 className="cz-label">{t('horse.horses')}</h2>
            <div className="hr-runner-list" role="radiogroup" aria-label={t('horse.horses')}>
              {(race?.runners ?? []).map((r) => {
                const on = selected === r.horse;
                const place = podium ? podium.indexOf(r.horse) : phase === 'racing' ? ranks.indexOf(r.horse) : -1;
                return (
                  <button
                    key={r.horse}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`hr-runner ${on ? 'is-on' : ''} ${mine?.horse === r.horse ? 'is-mine' : ''}`}
                    onClick={() => setPick(r.horse)}
                    disabled={locked}
                  >
                    <HorseBadge n={r.horse} />
                    <span className="hr-runner-text">
                      <b>
                        #{r.horse} {name(r.horse)}
                      </b>
                      {place >= 0 && <small>{t('horse.place', { n: place + 1 })}</small>}
                    </span>
                    <span className="hr-odds">{odds(r.odds)}</span>
                    <span className="hr-tick" aria-hidden>
                      {on && <Check className="w-4 h-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="cz-panel hr-bets">
            <div className="cz-seg" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'bets'} onClick={() => setTab('bets')}>
                {t('horse.bets')}
              </button>
              <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')} disabled={!signedIn}>
                {t('horse.myBets')}
              </button>
            </div>
            <table className="hr-table">
              <thead>
                <tr>
                  <th>{tab === 'bets' ? t('horse.col.player') : t('horse.col.race')}</th>
                  <th>{t('horse.col.horse')}</th>
                  <th>{t('horse.col.bet')}</th>
                  <th>{t('horse.col.result')}</th>
                </tr>
              </thead>
              <tbody>
                {tab === 'bets'
                  ? (state?.bets ?? []).map((b, i) => (
                      <tr key={`${b.name}-${i}`} className={`${b.me ? 'is-me' : ''} is-${b.status}`}>
                        <td>{b.name}</td>
                        <td>#{b.horse}</td>
                        <td>{formatChips(b.amount)}</td>
                        <td>{b.status === 'won' ? `+${formatChips(b.payout ?? 0)}` : b.status === 'lost' ? `−${formatChips(b.amount)}` : odds(b.odds)}</td>
                      </tr>
                    ))
                  : history.map((b) => (
                      <tr key={b.race} className={`is-${b.status}`}>
                        <td>#{b.race}</td>
                        <td>#{b.horse}</td>
                        <td>{formatChips(b.amount)}</td>
                        <td>{b.status === 'won' ? `+${formatChips(b.payout ?? 0)}` : b.status === 'lost' ? `−${formatChips(b.amount)}` : odds(b.odds)}</td>
                      </tr>
                    ))}
                {(tab === 'bets' ? state?.bets ?? [] : history).length === 0 && (
                  <tr>
                    <td colSpan={4} className="hr-empty">
                      {tab === 'bets' ? t('horse.noBets') : t('horse.noMyBets')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {race && <FairPanel fair={{ round: race.id, hash: race.hash, revealed }} verify={verifyRace} detail={(r) => t('horse.fairDetail', { order: r.order.slice(0, 3).map((h) => `#${h}`).join(' · ') })} />}
        </aside>
      </div>

      {help && <RulesSheet title={t('horse.helpTitle')} items={['how', 'odds', 'race', 'pay', 'fair', 'coins'].map((k) => t(`horse.help.${k}`))} onClose={() => setHelp(false)} />}
    </CasinoFrame>
  );
}
