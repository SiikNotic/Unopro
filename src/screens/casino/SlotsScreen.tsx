import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { ChipSelector } from '@/components/casino/chips';
import { SlotReel } from '@/components/casino/SlotReel';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import type { SlotSymbol } from '@/casino/slots';
import { lineWin, MIXED_SUITS, ONE_GEM, payline, returnToPlayer, spinReels, THREE_OF_A_KIND, TWO_GEMS } from '@/casino/slots';
import { createRng, randomSeed } from '@/game/engine';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { playSfx } from '@/audio/sfx';

const rng = createRng(randomSeed());
const BETS = [10, 25, 50, 100] as const;
const DURATIONS = [1100, 1550, 2000];
const LOOPS = [2, 3, 4];
let savedStops = spinReels(createRng(randomSeed()));

const THREES: SlotSymbol[] = ['seven', 'gem', 'star', 'flame', 'drop', 'leaf', 'sun'];

export function SlotsScreen() {
  const { t } = useI18n();
  const { balance, spend, credit } = useWallet();
  const reduced = useReducedMotion();
  const vw = useViewport().width;
  const [bet, setBet] = useState(10);
  const [stops, setStops] = useState(savedStops);
  const [from, setFrom] = useState(savedStops);
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState<{ amount: number; bet: number } | null>(null);
  const pendingPayout = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      if (pendingPayout.current > 0) credit(pendingPayout.current);
    },
    [credit]
  );

  const doSpin = () => {
    if (spinning || !spend(bet)) {
      playSfx('error');
      return;
    }
    const next = spinReels(rng);
    const { multiplier } = lineWin(payline(next));
    const payout = bet * multiplier;
    pendingPayout.current = payout;
    savedStops = next;
    setFrom(stops);
    setStops(next);
    setSpinId((id) => id + 1);
    setSpinning(true);
    setWin(null);
    playSfx('roundStart');

    const durations = reduced ? [0, 0, 0] : DURATIONS;
    timers.current = durations.map((d) => window.setTimeout(() => playSfx('reelStop'), d));
    timers.current.push(
      window.setTimeout(
        () => {
          credit(pendingPayout.current);
          pendingPayout.current = 0;
          setSpinning(false);
          setWin({ amount: payout, bet });
          if (payout > 0) playSfx(multiplier >= 30 ? 'victory' : 'cashIn');
        },
        (reduced ? 0 : DURATIONS[2]) + 150
      )
    );
  };

  const cellHeight = Math.round(Math.min(96, Math.max(64, (Math.min(vw, 520) - 110) / 3)));
  const durations = reduced ? [0, 0, 0] : DURATIONS;
  const hit = win && win.amount > 0;

  const payRows: { icons: React.ReactNode; label?: string; mult: number }[] = [
    ...THREES.map((s) => ({ icons: [s, s, s].map((x, i) => <SlotSymbolIcon key={i} symbol={x} className="w-6 h-6" />), mult: THREE_OF_A_KIND[s] })),
    { icons: [0, 1].map((i) => <SlotSymbolIcon key={i} symbol="gem" className="w-6 h-6" />), label: t('casino.slots.twoGems'), mult: TWO_GEMS },
    {
      icons: (['flame', 'drop', 'leaf'] as SlotSymbol[]).map((x) => <SlotSymbolIcon key={x} symbol={x} className="w-6 h-6" />),
      label: t('casino.slots.mixedSuits'),
      mult: MIXED_SUITS,
    },
    { icons: <SlotSymbolIcon symbol="gem" className="w-6 h-6" />, label: t('casino.slots.oneGem'), mult: ONE_GEM },
  ];

  return (
    <CasinoFrame title={t('casino.slots.name')} subtitle={t('casino.slots.rules')} back="casino" scenario="space">
      <section className="slot-cabinet mx-auto w-full max-w-[520px] p-4 sm:p-6 flex flex-col items-center gap-4" aria-label={t('casino.slots.machine')}>
        <div className="flex items-center gap-2 font-display font-extrabold text-gold-400 tracking-[0.2em] uppercase text-sm">
          <Sparkles className="w-4 h-4" aria-hidden />
          {t('casino.slots.marquee')}
          <Sparkles className="w-4 h-4" aria-hidden />
        </div>
        <div className="slot-window w-full flex" role="img" aria-label={t('casino.slots.line', { symbols: payline(stops).map((s) => t(`casino.slots.symbols.${s}`)).join(', ') })}>
          {[0, 1, 2].map((r) => (
            <SlotReel key={`${r}-${spinId}`} from={from[r]} to={stops[r]} loops={spinId === 0 ? 0 : LOOPS[r]} durationMs={durations[r]} cellHeight={cellHeight} />
          ))}
          <div className="slot-shade" />
          <div className={`slot-payline ${hit ? 'slot-payline-win' : ''}`} />
        </div>
        <div className="h-7 flex items-center" role="status" aria-live="polite">
          {win && !spinning && (
            <p className={`font-display font-extrabold text-lg casino-pop ${hit ? 'text-gold-400' : 'text-white/70'}`}>
              {!hit ? t('casino.noWin') : win.amount === win.bet ? t('casino.slots.betBack') : t('casino.slots.win', { amount: win.amount })}
            </p>
          )}
        </div>
        <div className="w-full flex flex-col gap-2">
          <p className="text-center text-xs text-white/70">{t('casino.slots.betPerSpin')}</p>
          <ChipSelector selected={bet} onSelect={(v) => { setBet(v); playSfx('chip'); }} max={spinning ? 0 : balance} values={BETS} />
          <Button size="lg" fullWidth disabled={spinning || bet > balance} onClick={doSpin}>
            {spinning ? t('casino.slots.spinning') : t('casino.slots.spin', { amount: bet })}
          </Button>
        </div>
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
