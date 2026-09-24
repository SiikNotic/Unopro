import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { Chip, ChipSelector } from '@/components/casino/chips';
import { RouletteWheel } from '@/components/casino/RouletteWheel';
import { RulesSheet } from '@/components/casino/RulesSheet';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import type { Bet, BetType } from '@/casino/roulette';
import { betWins, pocketColor, POCKETS, sameSpot, spin, totalPayout, WHEEL_ORDER } from '@/casino/roulette';
import { cryptoRng, newId } from '@/casino/random';
import { useAccount } from '@/account/useAccount';
import { serverRound } from '@/account/serverRound';
import type { RouletteResult } from '@/casino/server/protocol';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { playSfx } from '@/audio/sfx';

const rng = cryptoRng();
const SPIN_MS = 4600;
const SLICE = 360 / POCKETS;
let savedHistory: number[] = [];

type Phase = 'idle' | 'spinning' | 'result';

const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1);
const COLOR_CLASS = { red: 'roulette-red', black: 'roulette-black', green: 'roulette-green' } as const;

export function RouletteScreen() {
  const { t } = useI18n();
  const { balance, startRound, settleRound, mode } = useWallet();
  const account = useAccount();
  const [error, setError] = useState<string | null>(null);
  // Account mode: a round on the server in flight, and the balance to show once the ball lands.
  const serverBusy = useRef(false);
  const landBalance = useRef<number | null>(null);
  const reduced = useReducedMotion();
  const { width: vw, height: vh } = useViewport();
  const [bets, setBets] = useState<Bet[]>([]);
  const [lastBets, setLastBets] = useState<Bet[]>([]);
  const [chip, setChip] = useState(10);
  const [tab, setTab] = useState<'numbers' | 'outside'>('numbers');
  const [help, setHelp] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<number | null>(null);
  const [won, setWon] = useState(0);
  const [history, setHistory] = useState<number[]>(savedHistory);
  const [rotor, setRotor] = useState(0);
  const [ball, setBall] = useState(0);
  // The open wallet round of the spin in flight (paid once, when the ball lands or when leaving).
  const pendingRound = useRef<string | null>(null);
  const timer = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Leaving mid-spin still pays what the ball already decided.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pendingRound.current) settleRound(pendingRound.current);
      if (landBalance.current !== null) account.setBalance(landBalance.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
    [settleRound]
  );

  const staked = bets.reduce((s, b) => s + b.amount, 0);
  const amountOn = (type: BetType, value?: number) => bets.filter((b) => sameSpot(b, { type, value, amount: 0 })).reduce((s, b) => s + b.amount, 0);

  const place = (type: BetType, value?: number) => {
    if (phase === 'spinning') return;
    const base = phase === 'result' ? [] : bets;
    const baseTotal = base.reduce((s, b) => s + b.amount, 0);
    if (baseTotal + chip > balance) {
      playSfx('error');
      return;
    }
    if (phase === 'result') {
      setPhase('idle');
      setResult(null);
    }
    playSfx('chip');
    setBets([...base, { type, value, amount: chip }]);
  };

  /** Turns the wheel to `n` and reveals the result when the ball lands. */
  const animateTo = (n: number, payout: number, onLand: () => void) => {
    const index = WHEEL_ORDER.indexOf(n);
    const target = (((-index * SLICE - rotor) % 360) + 360) % 360;
    setRotor(rotor + 360 * 4 + target);
    setBall(ball - 360 * 6 - (((ball % 360) + 360) % 360));
    playSfx('wheel');
    wheelRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

    timer.current = window.setTimeout(
      () => {
        onLand();
        setResult(n);
        setWon(payout);
        setPhase('result');
        setHistory((h) => (savedHistory = [n, ...h].slice(0, 12)));
        playSfx(payout > 0 ? 'cashIn' : 'defeat');
      },
      reduced ? 250 : SPIN_MS
    );
  };

  const doSpin = (placed: Bet[]) => {
    const total = placed.reduce((s, b) => s + b.amount, 0);
    if (mode === 'account') {
      void spinOnServer(placed, total);
      return;
    }
    // A second tap before React re-renders must not start a second spin.
    if (pendingRound.current) return;
    // The result is drawn first and fixed in the wallet round together with the stake.
    const n = spin(rng);
    const payout = totalPayout(placed, n);
    const id = total > 0 ? startRound('roulette', total, payout) : null;
    if (!id) {
      playSfx('error');
      return;
    }
    pendingRound.current = id;
    setBets(placed);
    setLastBets(placed);
    setResult(null);
    setPhase('spinning');
    animateTo(n, payout, () => {
      settleRound(id);
      pendingRound.current = null;
    });
  };

  /** Account coins: the server spins, books and answers; the wheel then shows that result. */
  const spinOnServer = async (placed: Bet[], total: number) => {
    if (serverBusy.current || landBalance.current !== null) return;
    if (total <= 0 || total > balance) {
      playSfx('error');
      return;
    }
    serverBusy.current = true;
    setError(null);
    setBets(placed);
    setLastBets(placed);
    setResult(null);
    setPhase('spinning');
    const res = await serverRound<RouletteResult>({ op: 'roulette', requestId: newId(), bets: placed });
    serverBusy.current = false;
    if (!res.ok) {
      setPhase('idle');
      setError(t(`casino.accountErrors.${res.code}`));
      playSfx('error');
      void account.refreshCoins();
      return;
    }
    const r = res.data;
    // The stake is gone now; the winnings show when the ball lands.
    account.setBalance(r.balance - r.payout);
    landBalance.current = r.balance;
    animateTo(r.pocket, r.payout, () => {
      account.setBalance(r.balance);
      landBalance.current = null;
    });
  };

  const spinning = phase === 'spinning';
  const showWin = phase === 'result' && result !== null;
  const spot = (type: BetType, value: number | undefined, label: React.ReactNode, colorClass: string, extra = '', aria?: string) => {
    const amount = amountOn(type, value);
    const win = showWin && betWins({ type, value, amount: 0 }, result!);
    return (
      <button
        key={`${type}-${value ?? ''}`}
        type="button"
        onClick={() => place(type, value)}
        disabled={spinning}
        aria-label={`${aria ?? String(label)}${amount ? ` — ${t('casino.onSpot', { amount })}` : ''}`}
        className={`roulette-spot ${colorClass} ${win ? 'roulette-win' : ''} ${extra}`}
      >
        <span className="leading-none">{label}</span>
        {amount > 0 && (
          <span className="roulette-stack">
            <Chip value={amount} size={22} />
          </span>
        )}
      </button>
    );
  };

  const numberSpot = (n: number) => spot('straight', n, n, COLOR_CLASS[pocketColor(n)], '', t('casino.roulette.number', { n }));
  const dozenSpot = (d: number) => spot('dozen', d, t(`casino.roulette.dozen${d}`), 'roulette-outside', '', t('casino.roulette.dozenAria', { d }));
  const columnSpot = (c: number, label: React.ReactNode = '2:1') => spot('column', c, label, 'roulette-outside', '', t('casino.roulette.columnAria', { c }));
  const evens: [BetType, string, string][] = [
    ['red', t('casino.roulette.red'), 'roulette-red'],
    ['black', t('casino.roulette.black'), 'roulette-black'],
    ['even', t('casino.roulette.even'), 'roulette-outside'],
    ['odd', t('casino.roulette.odd'), 'roulette-outside'],
    ['low', '1–18', 'roulette-outside'],
    ['high', '19–36', 'roulette-outside'],
  ];

  const numbersStaked = bets.filter((b) => b.type === 'straight').reduce((s, b) => s + b.amount, 0);
  const outsideStaked = staked - numbersStaked;
  const lastTotal = lastBets.reduce((s, b) => s + b.amount, 0);
  const wide = vw >= 768;
  const wheelSize = wide ? 272 : Math.round(Math.max(150, Math.min(vw * 0.5, vh * 0.27, 250)));
  const repeat = phase === 'result' || (bets.length === 0 && lastBets.length > 0);

  const resultBlock = (
    <div className="flex flex-col items-center gap-2 min-w-0" role="status" aria-live="polite">
      <div
        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center font-display font-extrabold text-2xl sm:text-3xl text-white border-2 border-[rgba(216,178,106,0.6)] ${
          result !== null && !spinning ? COLOR_CLASS[pocketColor(result)] : 'bg-black/40'
        } ${showWin ? 'casino-pop' : ''}`}
        aria-label={result !== null ? t('casino.roulette.result', { n: result }) : t('casino.roulette.waiting')}
      >
        {spinning ? <span className="w-2.5 h-2.5 rounded-full bg-white/80 animate-ping" aria-hidden /> : (result ?? '–')}
      </div>
      <p className={`text-center text-sm font-semibold min-h-[20px] ${showWin && won > 0 ? 'text-[var(--cz-gold-hover)]' : 'text-[var(--cz-muted)]'}`}>
        {spinning ? t('casino.roulette.spinning') : showWin ? (won > 0 ? t('casino.roulette.paid', { amount: won }) : t('casino.noWin')) : t('casino.roulette.placeBets')}
      </p>
      {history.length > 0 && (
        <div className="flex flex-col items-center gap-1 w-full">
          <span className="cz-label">{t('casino.roulette.history')}</span>
          <div className="flex flex-wrap justify-center gap-1 max-w-[200px] sm:max-w-[240px]">
            {history.slice(0, wide ? 12 : 8).map((n, i) => (
              <span key={`${i}-${n}`} className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[11px] font-bold text-white flex items-center justify-center ${COLOR_CLASS[pocketColor(n)]} ${i === 0 ? 'ring-1 ring-[var(--cz-gold)]' : 'opacity-85'}`}>
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const dock = (
    <div className="flex flex-col gap-2.5">
      <ChipSelector selected={chip} onSelect={(v) => { setChip(v); playSfx('chip'); }} max={Math.max(0, balance - (phase === 'result' ? 0 : staked))} />
      <div className="flex gap-2">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn !w-12 !h-[54px]" disabled={spinning || phase === 'result' || bets.length === 0} onClick={() => setBets(bets.slice(0, -1))} aria-label={t('casino.undo')} title={t('casino.undo')}>
          <Undo2 className="w-5 h-5" />
        </button>
        <button
          type="button"
          className="cz-btn cz-btn-secondary cz-icon-btn !w-12 !h-[54px]"
          disabled={spinning || bets.length === 0}
          onClick={() => {
            setBets([]);
            if (phase === 'result') setPhase('idle');
          }}
          aria-label={t('casino.clear')}
          title={t('casino.clear')}
        >
          <Trash2 className="w-5 h-5" />
        </button>
        {repeat ? (
          <button type="button" className="cz-btn cz-btn-primary cz-btn-lg flex-1 min-w-0" disabled={spinning || lastTotal > balance} onClick={() => doSpin(lastBets)}>
            <RotateCcw className="w-5 h-5 shrink-0" /> <span className="truncate">{t('casino.roulette.spinAgain', { amount: lastTotal })}</span>
          </button>
        ) : (
          <button type="button" className="cz-btn cz-btn-primary cz-btn-lg flex-1 min-w-0" disabled={spinning || staked === 0} onClick={() => doSpin(bets)}>
            <span className="truncate">{spinning ? t('casino.roulette.spinning') : staked > 0 ? t('casino.roulette.spinFor', { amount: staked }) : t('casino.roulette.pickSpots')}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <CasinoFrame
      title={t('casino.roulette.name')}
      subtitle={t('casino.roulette.rules')}
      back="gameModes"
      scenario="city"
      onHelp={() => setHelp(true)}
      error={error}
      dock={dock}
      maxWidth="max-w-5xl"
    >
      {help && (
        <RulesSheet title={t('casino.roulette.helpTitle')} items={['how', 'inside', 'outside', 'zero'].map((k) => t(`casino.roulette.help.${k}`))} onClose={() => setHelp(false)} />
      )}

      <div className="grid gap-3 sm:gap-4 md:grid-cols-[320px_1fr] md:items-start">
        {/* Wheel, last result and history */}
        <section ref={wheelRef} className="cz-panel p-3 sm:p-4 grid grid-cols-[auto_1fr] md:grid-cols-1 items-center justify-items-center gap-3 md:gap-4" aria-label={t('casino.roulette.wheel')}>
          <RouletteWheel rotorDeg={rotor} ballDeg={ball} durationMs={reduced ? 0 : SPIN_MS} highlight={showWin ? result : null} size={wheelSize} label={t('casino.roulette.wheel')} />
          {resultBlock}
        </section>

        {/* Betting layout */}
        <section className="cz-felt p-3 sm:p-4" aria-label={t('casino.roulette.board')}>
          {/* Phones and small tablets: two tabs with thumb-sized spots */}
          <div className="lg:hidden flex flex-col gap-3">
            <div className="cz-seg" role="tablist" aria-label={t('casino.roulette.board')}>
              {(['numbers', 'outside'] as const).map((k) => {
                const amount = k === 'numbers' ? numbersStaked : outsideStaked;
                return (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                    {t(`casino.roulette.tab.${k}`)}
                    {amount > 0 && <span className="cz-num ml-1 opacity-70">· {amount}</span>}
                  </button>
                );
              })}
            </div>
            {tab === 'numbers' ? (
              <div className="grid grid-cols-6 gap-1.5" role="tabpanel">
                {spot('straight', 0, 0, 'roulette-green', 'col-span-6', t('casino.roulette.number', { n: 0 }))}
                {NUMBERS.map((n) => numberSpot(n))}
              </div>
            ) : (
              <div className="flex flex-col gap-3" role="tabpanel">
                <div>
                  <p className="cz-label mb-1.5 text-[rgba(232,214,170,0.75)]">{t('casino.roulette.evenMoney')}</p>
                  <div className="grid grid-cols-2 gap-1.5">{evens.map(([type, label, cls]) => spot(type, undefined, label, cls))}</div>
                </div>
                <div>
                  <p className="cz-label mb-1.5 text-[rgba(232,214,170,0.75)]">{t('casino.roulette.dozens')}</p>
                  <div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((d) => dozenSpot(d))}</div>
                </div>
                <div>
                  <p className="cz-label mb-1.5 text-[rgba(232,214,170,0.75)]">{t('casino.roulette.columns')}</p>
                  <div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((c) => columnSpot(c, t('casino.roulette.columnShort', { c })))}</div>
                </div>
              </div>
            )}
          </div>

          {/* Tablets and desktop: the classic layout */}
          <div className="hidden lg:grid gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
            <div className="row-span-3 grid">{spot('straight', 0, 0, 'roulette-green', '', t('casino.roulette.number', { n: 0 }))}</div>
            {NUMBERS.map((n) => (
              <div key={n} style={{ gridColumn: 2 + Math.floor((n - 1) / 3), gridRow: 3 - ((n - 1) % 3) }} className="grid">
                {numberSpot(n)}
              </div>
            ))}
            {[1, 2, 3].map((c, i) => (
              <div key={c} style={{ gridColumn: 14, gridRow: 3 - i }} className="grid">
                {columnSpot(c)}
              </div>
            ))}
            {[1, 2, 3].map((d, i) => (
              <div key={d} style={{ gridColumn: `${2 + i * 4} / span 4`, gridRow: 4 }} className="grid">
                {dozenSpot(d)}
              </div>
            ))}
            {[evens[4], evens[2], evens[0], evens[1], evens[3], evens[5]].map(([type, label, cls], i) => (
              <div key={type} style={{ gridColumn: `${2 + i * 2} / span 2`, gridRow: 5 }} className="grid">
                {spot(type, undefined, label, cls)}
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-[rgba(232,214,170,0.6)]">{t('casino.roulette.payHint')}</p>
        </section>
      </div>
    </CasinoFrame>
  );
}
