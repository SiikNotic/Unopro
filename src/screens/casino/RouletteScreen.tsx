import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Trash2, Undo2, Disc3 } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { Chip, ChipSelector } from '@/components/casino/chips';
import { RouletteWheel } from '@/components/casino/RouletteWheel';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import type { Bet, BetType } from '@/casino/roulette';
import { betWins, pocketColor, POCKETS, sameSpot, spin, totalPayout, WHEEL_ORDER } from '@/casino/roulette';
import { createRng, randomSeed } from '@/game/engine';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { playSfx } from '@/audio/sfx';

const rng = createRng(randomSeed());
const SPIN_MS = 4600;
const SLICE = 360 / POCKETS;
let savedHistory: number[] = [];

type Phase = 'idle' | 'spinning' | 'result';

const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1);
const COLOR_CLASS = { red: 'roulette-red', black: 'roulette-black', green: 'roulette-green' } as const;

export function RouletteScreen() {
  const { t } = useI18n();
  const { balance, spend, credit } = useWallet();
  const reduced = useReducedMotion();
  const vw = useViewport().width;
  const [bets, setBets] = useState<Bet[]>([]);
  const [lastBets, setLastBets] = useState<Bet[]>([]);
  const [chip, setChip] = useState(10);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<number | null>(null);
  const [won, setWon] = useState(0);
  const [history, setHistory] = useState<number[]>(savedHistory);
  const [rotor, setRotor] = useState(0);
  const [ball, setBall] = useState(0);
  const pendingPayout = useRef(0);
  const timer = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Leaving mid-spin still pays what the ball already decided.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pendingPayout.current > 0) credit(pendingPayout.current);
    },
    [credit]
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

  const doSpin = (placed: Bet[]) => {
    const total = placed.reduce((s, b) => s + b.amount, 0);
    if (total <= 0 || !spend(total)) {
      playSfx('error');
      return;
    }
    const n = spin(rng);
    const payout = totalPayout(placed, n);
    pendingPayout.current = payout;
    setBets(placed);
    setLastBets(placed);
    setResult(null);
    setPhase('spinning');

    const index = WHEEL_ORDER.indexOf(n);
    const target = (((-index * SLICE - rotor) % 360) + 360) % 360;
    setRotor(rotor + 360 * 4 + target);
    setBall(ball - 360 * 6 - (((ball % 360) + 360) % 360));
    playSfx('wheel');
    wheelRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

    timer.current = window.setTimeout(
      () => {
        credit(pendingPayout.current);
        pendingPayout.current = 0;
        setResult(n);
        setWon(payout);
        setPhase('result');
        setHistory((h) => (savedHistory = [n, ...h].slice(0, 12)));
        playSfx(payout > 0 ? 'cashIn' : 'defeat');
      },
      reduced ? 250 : SPIN_MS
    );
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
        <span className="text-[13px] sm:text-sm leading-none">{label}</span>
        {amount > 0 && (
          <span className="roulette-stack">
            <Chip value={amount} size={24} />
          </span>
        )}
      </button>
    );
  };

  const numberSpot = (n: number, style?: React.CSSProperties) => (
    <div key={n} style={style} className="contents">
      {spot('straight', n, n, COLOR_CLASS[pocketColor(n)], '', t('casino.roulette.number', { n }))}
    </div>
  );

  const dozens = [1, 2, 3].map((d) => spot('dozen', d, t(`casino.roulette.dozen${d}`), 'roulette-outside', '', t('casino.roulette.dozenAria', { d })));
  const columns = [1, 2, 3].map((c) => spot('column', c, '2:1', 'roulette-outside', '', t('casino.roulette.columnAria', { c })));
  const evens: [BetType, string, string][] = [
    ['low', '1–18', 'roulette-outside'],
    ['even', t('casino.roulette.even'), 'roulette-outside'],
    ['red', t('casino.roulette.red'), 'roulette-red'],
    ['black', t('casino.roulette.black'), 'roulette-black'],
    ['odd', t('casino.roulette.odd'), 'roulette-outside'],
    ['high', '19–36', 'roulette-outside'],
  ];

  const wheelSize = Math.max(200, Math.min(vw - 72, 290));

  return (
    <CasinoFrame title={t('casino.roulette.name')} subtitle={t('casino.roulette.rules')} back="casino" scenario="city">
      <section className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
        <div ref={wheelRef}>
          <RouletteWheel rotorDeg={rotor} ballDeg={ball} durationMs={reduced ? 0 : SPIN_MS} highlight={showWin ? result : null} size={wheelSize} label={t('casino.roulette.wheel')} />
        </div>
        <div className="flex flex-col items-center gap-3 min-w-0">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center font-display font-extrabold text-3xl text-white shadow-xl border-4 border-gold-400/70 ${
              result !== null ? COLOR_CLASS[pocketColor(result)] : 'bg-black/50'
            } ${showWin ? 'casino-pop' : ''}`}
            role="status"
            aria-live="polite"
            aria-label={result !== null ? t('casino.roulette.result', { n: result }) : t('casino.roulette.waiting')}
          >
            {spinning ? <Disc3 className="w-8 h-8 animate-spin text-white/70" aria-hidden /> : (result ?? '–')}
          </div>
          {showWin && (
            <p className={`font-display font-extrabold text-lg casino-pop ${won > 0 ? 'text-gold-400' : 'text-white/75'}`}>
              {won > 0 ? t('casino.roulette.paid', { amount: won }) : t('casino.noWin')}
            </p>
          )}
          {history.length > 0 && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold">{t('casino.roulette.history')}</span>
              <div className="flex flex-wrap justify-center gap-1 max-w-[240px]">
                {history.map((n, i) => (
                  <span key={`${i}-${n}`} className={`w-7 h-7 rounded-full text-[11px] font-extrabold text-white flex items-center justify-center ${COLOR_CLASS[pocketColor(n)]}`}>
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="casino-felt mx-2 p-2.5 sm:p-4" aria-label={t('casino.roulette.board')}>
        {/* Phones: vertical board */}
        <div className="grid sm:hidden grid-cols-3 gap-1">
          {spot('straight', 0, 0, 'roulette-green', 'col-span-3', t('casino.roulette.number', { n: 0 }))}
          {NUMBERS.map((n) => numberSpot(n))}
          {columns}
          {dozens}
          {evens.map(([type, label, cls]) => spot(type, undefined, label, cls))}
        </div>
        {/* Wider screens: classic horizontal layout */}
        <div className="hidden sm:grid gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          <div className="contents">{spot('straight', 0, 0, 'roulette-green', 'row-span-3', t('casino.roulette.number', { n: 0 }))}</div>
          {NUMBERS.map((n) => (
            <div key={n} className="contents">
              <div style={{ gridColumn: 2 + Math.floor((n - 1) / 3), gridRow: 3 - ((n - 1) % 3) }} className="grid">
                {spot('straight', n, n, COLOR_CLASS[pocketColor(n)], '', t('casino.roulette.number', { n }))}
              </div>
            </div>
          ))}
          {columns.map((c, i) => (
            <div key={i} style={{ gridColumn: 14, gridRow: 3 - i }} className="grid">
              {c}
            </div>
          ))}
          {dozens.map((d, i) => (
            <div key={i} style={{ gridColumn: `${2 + i * 4} / span 4`, gridRow: 4 }} className="grid">
              {d}
            </div>
          ))}
          {evens.map(([type, label, cls], i) => (
            <div key={type} style={{ gridColumn: `${2 + i * 2} / span 2`, gridRow: 5 }} className="grid">
              {spot(type, undefined, label, cls)}
            </div>
          ))}
        </div>
      </section>

      <div className="glass-strong rounded-3xl p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm px-1">
          <span className="text-ink-400">{t('casino.totalBet')}</span>
          <span className="font-display font-extrabold text-white tabular-nums">{staked}</span>
        </div>
        <ChipSelector selected={chip} onSelect={(v) => { setChip(v); playSfx('chip'); }} max={Math.max(0, balance - (phase === 'result' ? 0 : staked))} />
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={t('casino.undo')}
            title={t('casino.undo')}
            disabled={spinning || phase === 'result' || bets.length === 0}
            onClick={() => setBets(bets.slice(0, -1))}
            className="btn-game btn-secondary shrink-0 w-12 min-h-[48px] rounded-2xl flex items-center justify-center"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label={t('casino.clear')}
            title={t('casino.clear')}
            disabled={spinning || bets.length === 0}
            onClick={() => {
              setBets([]);
              if (phase === 'result') setPhase('idle');
            }}
            className="btn-game btn-secondary shrink-0 w-12 min-h-[48px] rounded-2xl flex items-center justify-center"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          {phase === 'result' || (bets.length === 0 && lastBets.length > 0) ? (
            <Button
              className="flex-1"
              icon={<RotateCcw className="w-5 h-5" />}
              disabled={spinning || lastBets.reduce((s, b) => s + b.amount, 0) > balance}
              onClick={() => doSpin(lastBets)}
            >
              {t('casino.again')}
            </Button>
          ) : (
            <Button className="flex-1" icon={<Disc3 className="w-5 h-5" />} disabled={spinning || staked === 0} onClick={() => doSpin(bets)}>
              {t('casino.roulette.spin')}
            </Button>
          )}
        </div>
      </div>
    </CasinoFrame>
  );
}
