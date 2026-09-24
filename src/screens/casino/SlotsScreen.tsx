import { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { ChipSelector } from '@/components/casino/chips';
import { CoinShower } from '@/components/casino/CoinShower';
import { SlotReel } from '@/components/casino/SlotReel';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import type { SlotSymbol } from '@/casino/slots';
import { lineWin, MIXED_FRONTIER, ONE_GOLD, payline, returnToPlayer, spinReels, THREE_OF_A_KIND, TWO_GOLD, winningReels } from '@/casino/slots';
import { createRng, randomSeed } from '@/game/engine';
import { useCountUp } from '@/hooks/useCountUp';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { storage } from '@/storage';
import { playSfx } from '@/audio/sfx';

const rng = createRng(randomSeed());
const BETS = [10, 25, 50, 100] as const;
const DURATIONS = [1150, 1600, 2050];
/** Extra time the last reel keeps turning when the first two already match a top symbol. */
const SUSPENSE_MS = 1400;
const LOOPS = [2, 3, 4];
const TEASE_SYMBOLS = new Set<SlotSymbol>(['seven', 'gold', 'eagle']);
const BEST_KEY = 'carta.slotsBest';
let savedStops = spinReels(createRng(randomSeed()));

type Tier = 'none' | 'back' | 'small' | 'big' | 'mega';

function tierFor(multiplier: number): Tier {
  if (multiplier <= 0) return 'none';
  if (multiplier === 1) return 'back';
  if (multiplier < 15) return 'small';
  if (multiplier < 60) return 'big';
  return 'mega';
}

const COINS: Record<Tier, number> = { none: 0, back: 0, small: 16, big: 40, mega: 80 };
const ROLL_MS: Record<Tier, number> = { none: 0, back: 0, small: 900, big: 1800, mega: 2600 };
const PAY_ORDER: SlotSymbol[] = ['seven', 'gold', 'eagle', 'bison', 'wagon', 'horse', 'horseshoe'];

interface SpinResult {
  id: number;
  amount: number;
  bet: number;
  tier: Tier;
  reels: number[];
}

/** Desert sunset behind the marquee title. */
function MarqueeArt() {
  return (
    <svg viewBox="0 0 320 80" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full" aria-hidden>
      <defs>
        <linearGradient id="gr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b1450" />
          <stop offset="0.5" stopColor="#c2410c" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <rect width="320" height="80" fill="url(#gr-sky)" />
      <circle cx="160" cy="70" r="26" fill="#ffe08a" opacity="0.9" />
      <path d="M0 62h28l6-16h30l5 16h36l4-10h22l4 10h95l6-20h34l6 20h48v18H0z" fill="#5a1f0e" />
      <path d="M0 72c40-6 80-6 120-2s90 5 130 0 50-3 70-1v11H0z" fill="#2a0e06" />
      <path d="M268 72v-18m0 6h-6v-6m6 10h5v-7" stroke="#2a0e06" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M44 74v-12m0 5h-4v-4m4 6h4v-5" stroke="#2a0e06" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Bulbs({ count }: { count: number }) {
  return (
    <div className="gr-bulbs w-full px-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="gr-bulb" style={{ '--i': i } as React.CSSProperties} />
      ))}
    </div>
  );
}

export function SlotsScreen() {
  const { t } = useI18n();
  const { balance, spend, credit } = useWallet();
  const reduced = useReducedMotion();
  const vw = useViewport().width;
  const [bet, setBet] = useState(10);
  const [stops, setStops] = useState(savedStops);
  const [from, setFrom] = useState(savedStops);
  const [spinId, setSpinId] = useState(0);
  const [durations, setDurations] = useState(DURATIONS);
  const [suspense, setSuspense] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [banner, setBanner] = useState(false);
  const [best, setBest] = useState(() => {
    const raw = storage.get<number>(BEST_KEY);
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });
  const pendingPayout = useRef(0);
  const timers = useRef<number[]>([]);
  const lastCoinSound = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      if (pendingPayout.current > 0) credit(pendingPayout.current);
    },
    [credit]
  );

  const tier = result?.tier ?? 'none';
  const celebrating = !spinning && (tier === 'small' || tier === 'big' || tier === 'mega');
  const rolled = useCountUp(result?.amount ?? 0, ROLL_MS[tier], result?.id, reduced, (v) => {
    // A coin clink every so often while the counter rolls.
    const now = performance.now();
    if (v > 0 && now - lastCoinSound.current > 90) {
      lastCoinSound.current = now;
      playSfx('coin');
    }
  });

  const doSpin = useCallback(() => {
    if (spinning || !spend(bet)) {
      playSfx('error');
      return;
    }
    const next = spinReels(rng);
    const line = payline(next);
    const { multiplier } = lineWin(line);
    const payout = bet * multiplier;
    const nextTier = tierFor(multiplier);
    const tease = !reduced && line[0] === line[1] && TEASE_SYMBOLS.has(line[0]);
    const plan = reduced ? [0, 0, 0] : [DURATIONS[0], DURATIONS[1], DURATIONS[2] + (tease ? SUSPENSE_MS : 0)];

    timers.current.forEach((id) => window.clearTimeout(id));
    pendingPayout.current = payout;
    savedStops = next;
    setFrom(stops);
    setStops(next);
    setDurations(plan);
    setSuspense(tease);
    setSpinId((id) => id + 1);
    setSpinning(true);
    setResult(null);
    setBanner(false);
    setPulled(true);
    playSfx('lever');
    if (!reduced) playSfx('reelSpin', 0.15);

    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    later(320, () => setPulled(false));
    plan.forEach((d) => later(d, () => playSfx('reelStop')));
    if (tease) later(plan[1], () => playSfx('anticipation'));
    later(plan[2] + 180, () => {
      credit(pendingPayout.current);
      pendingPayout.current = 0;
      setSpinning(false);
      setResult({ id: Date.now(), amount: payout, bet, tier: nextTier, reels: winningReels(line) });
      if (nextTier === 'big' || nextTier === 'mega') {
        setBanner(true);
        playSfx('bigWin');
        later(reduced ? 1800 : 3600, () => setBanner(false));
      } else if (nextTier === 'small') {
        playSfx('cashIn');
      }
      if (payout > bet) {
        setBest((b) => {
          if (payout <= b) return b;
          storage.set(BEST_KEY, payout);
          return payout;
        });
      }
    });
  }, [spinning, spend, bet, reduced, stops, credit]);

  // Space bar pulls the lever (when nothing else has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.target !== document.body) return;
      e.preventDefault();
      doSpin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSpin]);

  const cellHeight = Math.round(Math.min(100, Math.max(62, (Math.min(vw, 540) - 132) / 3)));
  const lineLabel = t('casino.slots.line', { symbols: payline(stops).map((s) => t(`casino.slots.symbols.${s}`)).join(', ') });

  let message = '';
  if (result && !spinning) {
    if (tier === 'none') message = t('casino.noWin');
    else if (tier === 'back') message = t('casino.slots.betBack');
    else message = t('casino.slots.win', { amount: rolled });
  }

  const payRows: { icons: React.ReactNode; label?: string; mult: number }[] = [
    ...PAY_ORDER.map((s) => ({
      icons: [0, 1, 2].map((i) => <SlotSymbolIcon key={i} symbol={s} className="w-7 h-7" />),
      mult: THREE_OF_A_KIND[s],
    })),
    { icons: [0, 1].map((i) => <SlotSymbolIcon key={i} symbol="gold" className="w-7 h-7" />), label: t('casino.slots.twoGold'), mult: TWO_GOLD },
    {
      icons: (['bison', 'wagon', 'horse'] as SlotSymbol[]).map((x) => <SlotSymbolIcon key={x} symbol={x} className="w-7 h-7" />),
      label: t('casino.slots.mixedFrontier'),
      mult: MIXED_FRONTIER,
    },
    { icons: <SlotSymbolIcon symbol="gold" className="w-7 h-7" />, label: t('casino.slots.oneGold'), mult: ONE_GOLD },
  ];

  return (
    <CasinoFrame title={t('casino.slots.name')} subtitle={t('casino.slots.rules')} back="casino" scenario="volcano">
      {celebrating && !reduced && result && <CoinShower key={result.id} id={result.id} count={COINS[tier]} />}

      <section
        className={`gr-cabinet mx-auto w-full max-w-[540px] px-3 py-3 sm:px-5 sm:py-4 flex flex-col items-center gap-3 ${spinning ? 'gr-spinning' : ''} ${celebrating ? 'gr-win' : ''} ${
          tier === 'mega' && !spinning && !reduced ? 'gr-cabinet-shake' : ''
        }`}
        aria-label={t('casino.slots.machine')}
      >
        <Bulbs count={14} />

        <div className="gr-marquee w-full h-[68px] sm:h-[80px] flex items-center justify-center">
          <MarqueeArt />
          <span className={`gr-title relative text-2xl sm:text-3xl ${celebrating ? 'gr-title-win' : ''}`}>{t('casino.slots.marquee')}</span>
        </div>

        <div className="w-full flex items-stretch gap-2">
          <div className="slot-window flex-1 flex" role="img" aria-label={lineLabel}>
            {[0, 1, 2].map((r) => (
              <SlotReel
                key={`${r}-${spinId}`}
                from={from[r]}
                to={stops[r]}
                loops={spinId === 0 ? 0 : LOOPS[r]}
                durationMs={durations[r]}
                cellHeight={cellHeight}
                highlight={celebrating && !!result && result.reels.includes(r)}
                anticipate={suspense && r === 2}
              />
            ))}
            <div className="slot-shade" />
            <div className={`slot-payline ${celebrating ? 'slot-payline-win' : ''}`} />
            {banner && result && (
              <button type="button" className="gr-bigwin" onClick={() => setBanner(false)} aria-label={t('common.close')}>
                <span className="gr-title text-3xl sm:text-4xl text-center px-2 casino-pop">{t(tier === 'mega' ? 'casino.slots.megaWin' : 'casino.slots.bigWin')}</span>
                <span className="gr-bigwin-amount gr-title text-4xl sm:text-5xl mt-1">{rolled.toLocaleString()}</span>
                <span className="text-xs text-white/80 mt-1 font-bold uppercase tracking-widest">{t('casino.slots.chips')}</span>
              </button>
            )}
          </div>
          <button
            type="button"
            className={`gr-lever ${pulled ? 'gr-lever-pulled' : ''}`}
            onClick={doSpin}
            disabled={spinning || bet > balance}
            aria-label={t('casino.slots.pullLever')}
            title={t('casino.slots.pullLever')}
          >
            <span className="gr-lever-base" />
            <span className="gr-lever-arm">
              <span className="gr-lever-knob" />
            </span>
          </button>
        </div>

        <div className="w-full grid grid-cols-[1fr_auto] gap-2 items-stretch">
          <div className="gr-readout rounded-xl px-3 py-1.5 flex items-center justify-center min-h-[40px]" role="status" aria-live="polite">
            <span className={`font-display font-extrabold text-sm sm:text-base text-center ${tier === 'none' || tier === 'back' ? 'opacity-70' : ''}`}>
              {spinning ? (suspense ? t('casino.slots.suspense') : t('casino.slots.spinning')) : message || t('casino.slots.good')}
            </span>
          </div>
          <div className="gr-readout rounded-xl px-2.5 py-1 flex flex-col items-center justify-center" aria-label={t('casino.slots.bestAria', { amount: best })}>
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-white/60 font-bold">
              <Trophy className="w-3 h-3" aria-hidden />
              {t('casino.slots.best')}
            </span>
            <span className="font-display font-extrabold text-sm tabular-nums">{best.toLocaleString()}</span>
          </div>
        </div>

        <div className="w-full flex flex-col gap-2">
          <p className="text-center text-xs text-white/75">{t('casino.slots.betPerSpin')}</p>
          <ChipSelector selected={bet} onSelect={(v) => { setBet(v); playSfx('chip'); }} max={spinning ? 0 : balance} values={BETS} />
          <Button size="lg" fullWidth disabled={spinning || bet > balance} onClick={doSpin}>
            {spinning ? t('casino.slots.spinning') : t('casino.slots.spin', { amount: bet })}
          </Button>
          <p className="text-center text-[11px] text-white/50 hidden sm:block">{t('casino.slots.hint')}</p>
        </div>

        <Bulbs count={14} />
      </section>

      <section className="glass-strong rounded-3xl p-4" aria-labelledby="paytable-title">
        <h2 id="paytable-title" className="font-display font-bold text-white mb-2">{t('casino.slots.paytable')}</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {payRows.map((row, i) => (
            <li key={i} className="flex items-center gap-2 text-sm min-w-0">
              <span className="flex items-center gap-0.5 shrink-0 rounded-lg bg-[#fffdf6] px-1 py-0.5">{row.icons}</span>
              <span className="text-ink-400 text-xs truncate flex-1">{row.label}</span>
              <span className="font-extrabold text-gold-400 tabular-nums shrink-0">×{row.mult}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-400">{t('casino.slots.payNote', { rtp: (returnToPlayer() * 100).toFixed(1) })}</p>
      </section>
    </CasinoFrame>
  );
}
