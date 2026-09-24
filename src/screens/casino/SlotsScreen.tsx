import { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, Minus, Plus, Trophy, X } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { CoinShower } from '@/components/casino/CoinShower';
import { SaloonBackdrop } from '@/components/casino/SaloonBackdrop';
import { SlotReel } from '@/components/casino/SlotReel';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import type { LineWin, SlotSymbol } from '@/casino/slots';
import { BET_PER_LINE, evaluateSpin, LINE_OPTIONS, LINES, lineSymbols, PAYTABLE, REELS, returnToPlayer, spinReels, visibleGrid, WILD, winCells } from '@/casino/slots';
import { createRng } from '@/game/engine';
import { cryptoRng, secureSeed } from '@/casino/random';
import { useCountUp } from '@/hooks/useCountUp';
import { useElementWidth } from '@/hooks/useViewport';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { storage } from '@/storage';
import { playSfx } from '@/audio/sfx';

const rng = cryptoRng();
const BASE_DURATIONS = [900, 1150, 1400, 1650, 1900];
const LOOPS = [2, 2, 3, 3, 4];
/** Top symbols that make the last reels hold back once three of them line up. */
const TEASE_SYMBOLS = new Set<SlotSymbol>(['seven', 'gold', 'eagle', WILD]);
const AUTO_SPINS = 10;
const BEST_KEY = 'carta.slotsBest';
const LINE_COLORS = ['#ffd24a', '#ff5d5d', '#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#2dd4bf', '#facc15', '#f87171'];
const PAY_ORDER: SlotSymbol[] = ['star', 'seven', 'gold', 'eagle', 'bison', 'wagon', 'revolver', 'moneybag', 'hat', 'horseshoe', 'cactus'];
let savedStops = spinReels(createRng(secureSeed()));
/** Exact return over every combination: computed lazily once (it walks 161k line combinations). */
let rtpText: string | null = null;
const rtpLabel = () => (rtpText ??= (returnToPlayer() * 100).toFixed(1));

type Tier = 'none' | 'partial' | 'win' | 'big' | 'jackpot';

function tierFor(total: number, bet: number, jackpot: boolean): Tier {
  if (jackpot || total >= bet * 50) return 'jackpot';
  if (total >= bet * 10) return 'big';
  if (total > bet) return 'win';
  if (total > 0) return 'partial';
  return 'none';
}

const COINS: Record<Tier, number> = { none: 0, partial: 0, win: 14, big: 40, jackpot: 90 };
const ROLL_MS: Record<Tier, number> = { none: 0, partial: 0, win: 900, big: 1800, jackpot: 2800 };

interface Outcome {
  id: number;
  total: number;
  bet: number;
  tier: Tier;
  wins: LineWin[];
}

function Bulbs({ count }: { count: number }) {
  return (
    <div className="gr-bulbs w-full px-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="gr-bulb" style={{ '--i': i } as React.CSSProperties} />
      ))}
    </div>
  );
}

function HelpSheet({ onClose, rtp }: { onClose: () => void; rtp: string }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="gr5-help-backdrop" onClick={onClose}>
      <div className="gr5-help p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="gr5-help-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="gr5-help-title" className="gr-title text-xl">{t('casino.slots.helpTitle')}</h2>
          <button type="button" className="gr5-btn w-10 h-10 p-0" onClick={onClose} aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-white/85 mb-2">{t('casino.slots.howToWin')}</p>
        <p className="text-sm text-white/85 mb-4 flex items-center gap-2">
          <SlotSymbolIcon symbol="star" className="w-8 h-8 shrink-0" />
          {t('casino.slots.wildRule')}
        </p>
        <h3 className="font-display font-bold text-gold-400 text-sm mb-2">{t('casino.slots.paytable')}</h3>
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 items-center text-sm mb-4">
          <span />
          {[3, 4, 5].map((n) => (
            <span key={n} className="text-[11px] text-white/60 font-bold text-center">×{n}</span>
          ))}
          {PAY_ORDER.map((s) => (
            <div key={s} className="contents">
              <span className="rounded-lg bg-[#fffaf0] p-0.5" title={t(`casino.slots.symbols.${s}`)}>
                <SlotSymbolIcon symbol={s} className="w-8 h-8" />
              </span>
              {PAYTABLE[s].map((m, i) => (
                <span key={i} className="text-center font-extrabold text-gold-400 tabular-nums">{m}</span>
              ))}
            </div>
          ))}
        </div>
        <h3 className="font-display font-bold text-gold-400 text-sm mb-2">{t('casino.slots.paylines')}</h3>
        <div className="grid grid-cols-5 gap-2 mb-4">
          {LINES.map((rows, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="gr5-mini-line" aria-hidden>
                {[0, 1, 2].map((r) => rows.map((row, c) => <span key={`${r}-${c}`} className={row === r ? 'on' : ''} />))}
              </div>
              <span className="text-[10px] text-white/60">{i + 1}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-white/60">{t('casino.slots.payNote', { rtp })}</p>
      </div>
    </div>
  );
}

export function SlotsScreen() {
  const { t } = useI18n();
  const { balance, startRound, settleRound } = useWallet();
  const reduced = useReducedMotion();
  const windowRef = useRef<HTMLDivElement>(null);
  const windowWidth = useElementWidth(windowRef);
  const [lines, setLines] = useState<number>(10);
  const [bplIndex, setBplIndex] = useState(0);
  const [stops, setStops] = useState(savedStops);
  const [from, setFrom] = useState(savedStops);
  const [spinId, setSpinId] = useState(0);
  const [durations, setDurations] = useState(BASE_DURATIONS);
  const [suspense, setSuspense] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [banner, setBanner] = useState(false);
  const [previewLines, setPreviewLines] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [help, setHelp] = useState(false);
  const [best, setBest] = useState(() => {
    const raw = storage.get<number>(BEST_KEY);
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });
  // Open wallet round of the spin in flight: also the lock against a second spin before re-render.
  const pendingRound = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const autoTimer = useRef(0);
  const previewTimer = useRef(0);
  const lastCoinSound = useRef(0);

  const betPerLine = BET_PER_LINE[bplIndex];
  const totalBet = lines * betPerLine;

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(autoTimer.current);
      window.clearTimeout(previewTimer.current);
      if (pendingRound.current) settleRound(pendingRound.current);
    },
    [settleRound]
  );

  const tier = outcome?.tier ?? 'none';
  const celebrating = !spinning && (tier === 'win' || tier === 'big' || tier === 'jackpot');
  const rolled = useCountUp(outcome?.total ?? 0, ROLL_MS[tier], outcome?.id, reduced, (v) => {
    const now = performance.now();
    if (v > 0 && now - lastCoinSound.current > 90) {
      lastCoinSound.current = now;
      playSfx('coin');
    }
  });

  const doSpin = useCallback(() => {
    if (pendingRound.current) return;
    // Reels are drawn first; the stake and the payout they decide are fixed together in one wallet round.
    const next = spinReels(rng);
    const result = evaluateSpin(next, lines, betPerLine);
    const id = startRound('slots', totalBet, result.total);
    if (!id) {
      playSfx('error');
      setAutoLeft(0);
      return;
    }
    pendingRound.current = id;
    const nextTier = tierFor(result.total, totalBet, result.jackpot);
    const grid = visibleGrid(next);
    // Hold the last reels back only when three top symbols already line up on an active line.
    const tease =
      !reduced &&
      Array.from({ length: lines }, (_, l) => lineSymbols(grid, l).slice(0, 3)).some((first) => {
        const base = first.find((s) => s !== WILD) ?? WILD;
        return TEASE_SYMBOLS.has(base) && first.every((s) => s === base || s === WILD);
      });
    const plan = reduced ? BASE_DURATIONS.map(() => 0) : BASE_DURATIONS.map((d, i) => d + (tease && i === 3 ? 700 : 0) + (tease && i === 4 ? 1500 : 0));

    timers.current.forEach((id) => window.clearTimeout(id));
    savedStops = next;
    setFrom(stops);
    setStops(next);
    setDurations(plan);
    setSuspense(tease);
    setSpinId((id) => id + 1);
    setSpinning(true);
    setOutcome(null);
    setBanner(false);
    setPreviewLines(false);
    setPulled(true);
    playSfx('lever');
    if (!reduced) playSfx('reelSpin', 0.1);

    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    later(320, () => setPulled(false));
    plan.forEach((d) => later(d, () => playSfx('reelStop')));
    if (tease) later(plan[2], () => playSfx('anticipation'));
    const end = Math.max(...plan) + 180;
    later(end, () => {
      settleRound(id);
      pendingRound.current = null;
      setSpinning(false);
      setOutcome({ id: Date.now(), total: result.total, bet: totalBet, tier: nextTier, wins: result.wins });
      if (nextTier === 'win' || nextTier === 'big' || nextTier === 'jackpot') {
        setBanner(true);
        playSfx(nextTier === 'win' ? 'cashIn' : 'bigWin');
        later(nextTier === 'win' ? 1600 : reduced ? 2000 : 3800, () => setBanner(false));
      }
      if (result.total > totalBet) {
        setBest((b) => {
          if (result.total <= b) return b;
          storage.set(BEST_KEY, result.total);
          return result.total;
        });
      }
    });
  }, [startRound, settleRound, totalBet, lines, betPerLine, reduced, stops]);

  // Auto spin: keeps going while there are spins left and chips to cover the bet; a big win pauses it.
  const spinRef = useRef(doSpin);
  spinRef.current = doSpin;
  useEffect(() => {
    if (spinning || autoLeft <= 0 || !outcome) return;
    if (tier === 'big' || tier === 'jackpot' || balance < totalBet) {
      setAutoLeft(0);
      return;
    }
    autoTimer.current = window.setTimeout(() => {
      setAutoLeft((n) => n - 1);
      spinRef.current();
    }, tier === 'win' ? 1500 : 650);
    return () => window.clearTimeout(autoTimer.current);
  }, [outcome, spinning, autoLeft, tier, balance, totalBet]);

  const toggleAuto = () => {
    if (autoLeft > 0) {
      setAutoLeft(0);
      window.clearTimeout(autoTimer.current);
      return;
    }
    setAutoLeft(AUTO_SPINS - 1);
    doSpin();
  };

  // Space bar spins (when nothing else has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.target !== document.body || help) return;
      e.preventDefault();
      spinRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help]);

  const showLines = (count: number) => {
    setLines(count);
    playSfx('chip');
    setOutcome(null);
    setPreviewLines(true);
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreviewLines(false), 1400);
  };

  const betMax = () => {
    let index = BET_PER_LINE.length - 1;
    while (index > 0 && BET_PER_LINE[index] * 10 > balance) index--;
    setBplIndex(index);
    showLines(10);
  };

  const reelWidth = windowWidth > 0 ? (windowWidth - 10 - 4 * (REELS - 1)) / REELS : 60;
  const cellHeight = Math.round(Math.min(104, Math.max(44, reelWidth * 0.94)));

  // Winning cells per reel, and the lines to draw over the reels.
  const rowsByReel: number[][] = Array.from({ length: REELS }, () => []);
  if (outcome && !spinning) for (const w of outcome.wins) for (const [reel, row] of winCells(w)) rowsByReel[reel].push(row);
  const drawnLines = !spinning && outcome && outcome.tier !== 'none' ? outcome.wins.map((w) => w.line) : previewLines ? Array.from({ length: lines }, (_, i) => i) : [];

  let status = t('casino.slots.good');
  if (spinning) status = suspense ? t('casino.slots.suspense') : t('casino.slots.spinning');
  else if (outcome) {
    if (tier === 'none') status = t('casino.noWin');
    else if (tier === 'partial') status = t('casino.slots.partial', { amount: outcome.total });
    else status = t('casino.slots.win', { amount: rolled });
  }
  const bigBanner = banner && outcome && (tier === 'big' || tier === 'jackpot');

  return (
    <CasinoFrame title={t('casino.slots.marquee')} subtitle={t('casino.slots.rules')} back="slotLobby" scenario="lounge" backdrop={<SaloonBackdrop />}>
      {celebrating && !reduced && outcome && <CoinShower key={outcome.id} id={outcome.id} count={COINS[tier]} />}
      {help && <HelpSheet onClose={() => setHelp(false)} rtp={rtpLabel()} />}

      <section
        className={`gr5-machine mx-auto w-full max-w-[640px] px-3 pt-4 pb-4 sm:px-6 flex flex-col gap-3 ${spinning ? 'gr-spinning' : ''} ${celebrating ? 'gr-win' : ''} ${
          tier === 'jackpot' && !spinning && !reduced ? 'gr-cabinet-shake' : ''
        }`}
        aria-label={t('casino.slots.machine')}
      >
        <span className="gr5-corner gr5-corner-tl" />
        <span className="gr5-corner gr5-corner-tr" />
        <span className="gr5-corner gr5-corner-bl" />
        <span className="gr5-corner gr5-corner-br" />

        <div className="relative flex items-center justify-center pt-1">
          <div className="gr5-plaque text-center mx-11 max-w-full">
            <div className={`gr-title text-[clamp(17px,5.6vw,36px)] leading-none whitespace-nowrap ${celebrating ? 'gr-title-win' : ''}`}>{t('casino.slots.marquee')}</div>
            <span className="gr5-ribbon mt-1">{t('casino.slots.slotWord')}</span>
          </div>
          <button type="button" className="gr5-btn absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 min-h-0 p-0" onClick={() => setHelp(true)} aria-label={t('casino.slots.help')} title={t('casino.slots.help')}>
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        <Bulbs count={16} />

        <div ref={windowRef} className="gr5-window" role="img" aria-label={t('casino.slots.window', { symbols: visibleGrid(stops).map((col) => t(`casino.slots.symbols.${col[1]}`)).join(', ') })}>
          {Array.from({ length: REELS }, (_, r) => (
            <SlotReel
              key={`${r}-${spinId}`}
              from={from[r]}
              to={stops[r]}
              loops={spinId === 0 ? 0 : LOOPS[r]}
              durationMs={durations[r]}
              cellHeight={cellHeight}
              highlightRows={celebrating || tier === 'partial' ? rowsByReel[r] : []}
              anticipate={suspense && r >= 3}
            />
          ))}
          <svg className="gr5-lines" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden>
            {drawnLines.map((l) => (
              <polyline
                key={l}
                className={`gr5-line ${previewLines ? '' : 'gr5-line-win'}`}
                points={LINES[l].map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' ')}
                stroke={LINE_COLORS[l]}
                vectorEffect="non-scaling-stroke"
                style={{ strokeWidth: previewLines ? 3 : 6 }}
              />
            ))}
          </svg>
          {banner && outcome && tier === 'win' && (
            <div className="gr5-float">
              <span className="gr5-banner-ribbon text-2xl sm:text-3xl inline-block">{t('casino.slots.youWin')}</span>
            </div>
          )}
          {bigBanner && (
            <button type="button" className="gr-bigwin" onClick={() => setBanner(false)} aria-label={t('common.close')}>
              <span className="gr5-banner-ribbon text-3xl sm:text-4xl">{t(tier === 'jackpot' ? 'casino.slots.jackpot' : 'casino.slots.bigWin')}</span>
              <span className="gr-bigwin-amount gr-title text-4xl sm:text-5xl mt-3">{rolled.toLocaleString()}</span>
              <span className="text-xs text-white/80 mt-1 font-bold uppercase tracking-widest">{t('casino.slots.chips')}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            [t('casino.slots.credit'), balance],
            [t('casino.slots.bet'), totalBet],
            [t('casino.slots.winLabel'), spinning ? 0 : rolled],
          ].map(([label, value]) => (
            <div key={label} className="gr5-panel px-2 py-1 text-center min-w-0">
              <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-white/55 font-bold truncate">{label}</div>
              <div className="font-display font-extrabold text-sm sm:text-lg truncate">{Number(value).toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-1 min-h-[20px]" role="status" aria-live="polite">
          <span className={`font-display font-bold text-sm ${celebrating ? 'text-gold-400' : 'text-white/80'}`}>{status}</span>
          <span className="flex items-center gap-1 text-xs text-white/70 shrink-0" aria-label={t('casino.slots.bestAria', { amount: best })}>
            <Trophy className="w-3.5 h-3.5 text-gold-400" aria-hidden />
            {best.toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold">{t('casino.slots.lines')}</span>
            <div className="flex gap-1" role="radiogroup" aria-label={t('casino.slots.lines')}>
              {LINE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={lines === n}
                  disabled={spinning || autoLeft > 0}
                  onClick={() => showLines(n)}
                  className={`gr5-btn gr5-seg ${lines === n ? 'gr5-btn-on' : ''}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold">{t('casino.slots.betPerLine')}</span>
            <div className="flex items-center gap-1">
              <button type="button" className="gr5-btn gr5-seg" disabled={spinning || autoLeft > 0 || bplIndex === 0} onClick={() => { setBplIndex((i) => i - 1); playSfx('chip'); }} aria-label={t('casino.slots.less')}>
                <Minus className="w-4 h-4" />
              </button>
              <span className="gr5-panel min-w-[38px] px-1.5 py-1 text-center font-display font-extrabold text-sm">{betPerLine}</span>
              <button
                type="button"
                className="gr5-btn gr5-seg"
                disabled={spinning || autoLeft > 0 || bplIndex === BET_PER_LINE.length - 1 || BET_PER_LINE[bplIndex + 1] * lines > balance}
                onClick={() => { setBplIndex((i) => i + 1); playSfx('chip'); }}
                aria-label={t('casino.slots.more')}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-5 sm:gap-8 pt-1">
          <button type="button" className="gr5-btn text-xs sm:text-sm" disabled={spinning || autoLeft > 0} onClick={betMax}>
            {t('casino.slots.betMax')}
          </button>
          <div className="relative">
            <button
              type="button"
              className={`gr5-spin ${pulled ? 'gr5-spin-pressed' : ''} ${!spinning && autoLeft === 0 && totalBet <= balance ? 'gr5-spin-ready' : ''}`}
              disabled={spinning || autoLeft > 0 || totalBet > balance}
              onClick={doSpin}
              aria-label={t('casino.slots.spinAria', { amount: totalBet })}
            >
              {t('casino.slots.spinWord')}
            </button>
            <span className={`gr5-lever ${pulled ? 'gr5-lever-pulled' : ''}`} aria-hidden />
          </div>
          <button type="button" className={`gr5-btn text-xs sm:text-sm ${autoLeft > 0 ? 'gr5-btn-on' : ''}`} disabled={autoLeft === 0 && (spinning || totalBet > balance)} onClick={toggleAuto} aria-pressed={autoLeft > 0}>
            {autoLeft > 0 ? t('casino.slots.autoStop', { n: autoLeft + (spinning ? 1 : 0) }) : t('casino.slots.auto', { n: AUTO_SPINS })}
          </button>
        </div>
        <p className="text-center text-[11px] text-white/50 hidden sm:block">{t('casino.slots.hint')}</p>
      </section>
    </CasinoFrame>
  );
}
