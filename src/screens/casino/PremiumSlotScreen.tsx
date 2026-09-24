import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Info, Minus, Plus, RotateCw, Server, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { ReelSet } from '@/components/slots/ReelSet';
import type { ReelSetHandle } from '@/components/slots/ReelSet';
import { Particles } from '@/components/slots/Particles';
import { SlotHistorySheet, SlotRulesSheet } from '@/components/slots/SlotSheets';
import { THEMES, themeStyle } from '@/components/slots/themes';
import '@/components/slots/premiumSlots.css';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { usePreferences, vibrate } from '@/settings/usePreferences';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useElementWidth } from '@/hooks/useViewport';
import { useCountUp } from '@/hooks/useCountUp';
import { storage } from '@/storage';
import { BET_LEVELS, cryptoUint32, drawStops, isMachineId, isValidBet, isValidStops, resolveSpin } from '@/casino/premium/engine';
import { RECEIPTS_KEY } from '@/casino/premium/localHouse';
import type { MachineId, WinTier } from '@/casino/premium/engine';
import { asSpinError, newRequestId, spinWithRecovery } from '@/casino/premium/service';
import type { SpinReceipt } from '@/casino/premium/service';
import { useSlotService } from '@/casino/premium/useSlotService';
import { addHistory, clearPending, loadHistory, loadPending, savePending } from '@/casino/premium/journal';
import type { HistoryItem } from '@/casino/premium/journal';
import { LINES, lineSymbols, REELS, visibleGrid, WILD, winCells } from '@/casino/slots';
import type { LineWin, SlotSymbol } from '@/casino/slots';
import { slotSound, startReelLoop, stopReelLoop } from '@/audio/slotAudio';

const BET_KEY = 'carta.slots.bet';
const AUTO_OPTIONS = [10, 25, 50, 100];
const LINE_COLORS = ['#ffd24a', '#ff6b6b', '#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#2dd4bf', '#facc15', '#f87171'];
const TEASE_SYMBOLS = new Set<SlotSymbol>(['seven', 'gold', 'eagle', WILD]);
/** How long the win amount rolls up, by tier (ms). Small wins are quick; nothing rolls for a partial refund. */
const ROLL_MS: Record<WinTier, number> = { none: 0, tiny: 0, small: 900, big: 2400, mega: 3600, jackpot: 5200 };
const PARTICLES: Record<WinTier, number> = { none: 0, tiny: 0, small: 0, big: 50, mega: 95, jackpot: 150 };
const BIG_TIERS: WinTier[] = ['big', 'mega', 'jackpot'];

type Phase = 'booting' | 'idle' | 'requesting' | 'landing' | 'presenting' | 'blocked';

interface Shown {
  receipt: SpinReceipt;
  wins: LineWin[];
  tier: WinTier;
  id: number;
  recovered: boolean;
}

interface Status {
  kind: 'info' | 'error' | 'win';
  text: string;
}

/** Last three reels hold back only when the first three already line up top symbols on a line. */
function isTease(stops: number[]): boolean {
  const grid = visibleGrid(stops);
  return LINES.some((_, l) => {
    const first = lineSymbols(grid, l).slice(0, 3);
    const base = first.find((s) => s !== WILD) ?? WILD;
    return TEASE_SYMBOLS.has(base) && first.every((s) => s === base || s === WILD);
  });
}

const readBet = () => {
  const b = storage.get<unknown>(BET_KEY);
  return isValidBet(b) ? b : BET_LEVELS[0];
};

export function PremiumSlotScreen() {
  const { params } = useNavigation();
  const machine: MachineId = isMachineId(params.machine) ? params.machine : 'lucky7s';
  // A different machine is a fresh screen: nothing carries over between machines.
  return <Machine key={machine} machine={machine} />;
}

function Machine({ machine }: { machine: MachineId }) {
  const { t, language } = useI18n();
  const theme = THEMES[machine];
  const service = useSlotService();
  const wallet = useWallet();
  const { preferences, setPreference } = usePreferences();
  const reduced = useReducedMotion();
  const remote = service.mode === 'remote';

  const reels = useRef<ReelSetHandle>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const windowWidth = useElementWidth(windowRef);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const viewportH = viewport.h;
  // Phone held sideways: machine and controls side by side instead of stacked.
  const sideways = viewport.w > viewport.h && viewport.h < 520;

  const [initialStops] = useState<number[]>(() => lastStops(machine));
  const stopsRef = useRef(initialStops);
  const [phase, setPhase] = useState<Phase>(() => (loadPending() ? 'booting' : 'idle'));
  const [bet, setBet] = useState(readBet);
  const [shown, setShown] = useState<Shown | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [skip, setSkip] = useState(false);
  const [banner, setBanner] = useState(false);
  const [presented, setPresented] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const [houseBalance, setHouseBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [sheet, setSheet] = useState<'rules' | 'history' | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoMenu, setAutoMenu] = useState(false);
  const [voided, setVoided] = useState(false);
  const [burst, setBurst] = useState(0);

  // Refs: the source of truth for guards (state lags a render behind a fast double tap).
  const busy = useRef(phase === 'booting');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const autoRef = useRef(0);
  autoRef.current = autoLeft;
  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);
  const lastCoin = useRef(0);
  const tease = useRef(false);

  const later = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== id);
      if (mounted.current) fn();
    }, ms);
    timers.current.push(id);
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      timers.current.forEach((id) => window.clearTimeout(id));
      stopReelLoop();
    };
  }, []);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // The house's balance: the wallet ledger locally, the server's figure in remote mode.
  const refreshHouseBalance = useCallback(async () => {
    if (!remote) return;
    try {
      const b = await service.balance();
      if (mounted.current) setHouseBalance(b);
    } catch {
      // shown as unknown; spins still work and every receipt carries the balance
    }
  }, [remote, service]);
  useEffect(() => void refreshHouseBalance(), [refreshHouseBalance]);

  const liveBalance = remote ? houseBalance : wallet.balance;
  const displayBalance = held ?? liveBalance;

  const stopAuto = useCallback(() => {
    setAutoLeft(0);
    autoRef.current = 0;
    setAutoMenu(false);
  }, []);

  // ---------- presenting a booked result ----------
  /** End of a presentation (timer or skipped): the payout shows in the balance and auto may continue. */
  const finish = useCallback((id: number) => {
    setHeld(null);
    setPhase((p) => (p === 'presenting' ? 'idle' : p));
    setPresented(id);
  }, []);

  const present = useCallback(
    (receipt: SpinReceipt, recovered: boolean) => {
      const res = resolveSpin(receipt.stops, receipt.bet);
      const id = Date.now();
      setShown({ receipt, wins: res.wins, tier: res.tier, id, recovered });
      setFocusLine(null);
      setSkip(recovered || reduced);
      setVoided(false);
      if (recovered) {
        setStatus({ kind: res.payout > 0 ? 'win' : 'info', text: res.payout > 0 ? t('slotsPremium.recoveredWin', { amount: res.payout.toLocaleString() }) : t('slotsPremium.recoveredLoss') });
        setHeld(null);
        setPresented(id);
        return;
      }
      setPhase('presenting');
      setStatus(null);
      const sound = { none: null, tiny: 'coin', small: 'small', big: 'big', mega: 'mega', jackpot: 'jackpot' } as const;
      const s = sound[res.tier];
      if (s) slotSound(s);
      if (BIG_TIERS.includes(res.tier)) {
        setBanner(true);
        vibrate(preferences.haptics, res.tier === 'big' ? 60 : [60, 40, 90]);
        if (!reduced) setBurst(id);
      }
      const roll = reduced ? 0 : ROLL_MS[res.tier];
      later(roll + 120, () => finish(id));
      if (BIG_TIERS.includes(res.tier)) later(roll + (reduced ? 1600 : 1400), () => setBanner(false));
    },
    [finish, later, preferences.haptics, reduced, t]
  );

  // ---------- recovering a spin whose result we never showed ----------
  const recover = useCallback(async () => {
    const pending = loadPending();
    if (!pending) {
      busy.current = false;
      setPhase('idle');
      return;
    }
    busy.current = true;
    setPhase('booting');
    setStatus({ kind: 'info', text: t('slotsPremium.recovering') });
    try {
      const receipt = await service.lookup(pending.requestId);
      if (!mounted.current) return;
      clearPending(pending.requestId);
      if (receipt) {
        setHistory(addHistory(receipt));
        if (remote) setHouseBalance(receipt.balance);
        if (receipt.machine === machine) {
          reels.current?.place(receipt.stops);
          stopsRef.current = receipt.stops;
          present(receipt, true);
        } else {
          setStatus({ kind: 'info', text: t('slotsPremium.recoveredElsewhere', { machine: t(`slotsPremium.machines.${receipt.machine}.name`), amount: receipt.payout.toLocaleString() }) });
        }
      } else {
        // The house never booked it: nothing was charged.
        setStatus({ kind: 'info', text: t('slotsPremium.neverBooked') });
      }
      busy.current = false;
      setPhase('idle');
    } catch {
      if (!mounted.current) return;
      busy.current = true;
      setPhase('blocked');
      setStatus({ kind: 'error', text: t('slotsPremium.errors.uncertain') });
    }
  }, [machine, present, remote, service, t]);

  useEffect(() => {
    if (loadPending()) void recover();
    // once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back online while a spin is unconfirmed: try again at once.
  useEffect(() => {
    if (phase !== 'blocked') return;
    const onOnline = () => void recover();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [phase, recover]);

  // ---------- spinning ----------
  const spin = useCallback(async () => {
    if (busy.current) return;
    const balanceNow = displayBalance;
    if (balanceNow !== null && bet > balanceNow) {
      slotSound('error');
      setStatus({ kind: 'error', text: t('slotsPremium.errors.insufficient_funds') });
      stopAuto();
      return;
    }
    busy.current = true;
    clearTimers();
    const req = { requestId: newRequestId(), machine, bet };
    // Written before anything is sent, so a reload or closed tab can always recover the real result.
    savePending({ ...req, at: Date.now() });
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setHeld(balanceNow);
    setPhase('requesting');
    setShown(null);
    setBanner(false);
    setSkip(false);
    setFocusLine(null);
    setVoided(false);
    setStatus(null);
    slotSound('click');
    slotSound('spin');
    startReelLoop();
    reels.current?.start();

    let receipt: SpinReceipt;
    try {
      receipt = await spinWithRecovery(service, req, {
        signal: ctrl.signal,
        onRetry: () => mounted.current && setStatus({ kind: 'info', text: t('slotsPremium.reconnecting') }),
      });
    } catch (e) {
      if (!mounted.current || ctrl.signal.aborted) return; // left the screen: the pending spin is recovered next visit
      const err = asSpinError(e);
      stopReelLoop();
      stopAuto();
      slotSound('error');
      await reels.current?.land(stopsRef.current, { tease: false });
      if (!mounted.current) return;
      setHeld(null);
      setVoided(true);
      setStatus({ kind: 'error', text: t(`slotsPremium.errors.${err.code}`) });
      if (err.uncertain) {
        // Maybe booked, maybe not: never guess. Keep the id and recover the real result.
        setPhase('blocked');
      } else {
        clearPending(req.requestId);
        if (err.code === 'insufficient_funds') void refreshHouseBalance();
        busy.current = false;
        setPhase('idle');
      }
      return;
    }
    if (!mounted.current) return;
    // Booked: the stake is taken and the payout credited. Show the balance without the payout until the
    // reels have stopped, so the top bar can't spoil the result.
    setHeld(receipt.balance - receipt.payout);
    if (remote) setHouseBalance(receipt.balance);
    setStatus(null);
    tease.current = !reduced && isTease(receipt.stops);
    if (tease.current) setStatus({ kind: 'info', text: t('slotsPremium.suspense') });
    setPhase('landing');
    await reels.current?.land(receipt.stops, { tease: tease.current });
    if (!mounted.current) return;
    stopReelLoop();
    stopsRef.current = receipt.stops;
    clearPending(req.requestId);
    setHistory(addHistory(receipt));
    busy.current = false;
    present(receipt, false);
  }, [bet, clearTimers, displayBalance, machine, present, reduced, refreshHouseBalance, remote, service, stopAuto, t]);

  const onReelLand = useCallback(
    (r: number) => {
      slotSound('reelStop');
      if (tease.current && r === 2) slotSound('anticipation');
    },
    []
  );

  const celebrating = phase === 'presenting' && !!shown && ROLL_MS[shown.tier] > 0 && !skip;
  const skipCelebration = () => {
    setSkip(true);
    setBanner(false);
    if (shown) finish(shown.id);
  };

  /** The big button: spin, quick-stop while landing, skip the celebration while it rolls. */
  const onSpinButton = () => {
    if (phaseRef.current === 'landing') {
      reels.current?.hurry();
      return;
    }
    if (celebrating) {
      skipCelebration();
      return;
    }
    if (autoRef.current > 0) {
      stopAuto();
      return;
    }
    void spin();
  };

  // ---------- auto spin ----------
  const spinRef = useRef(spin);
  spinRef.current = spin;
  useEffect(() => {
    if (!presented || autoRef.current <= 0 || phaseRef.current !== 'idle') return;
    const tier = shown?.tier ?? 'none';
    if (BIG_TIERS.includes(tier)) {
      stopAuto();
      setStatus({ kind: 'win', text: t('slotsPremium.autoStoppedWin') });
      return;
    }
    const b = remote ? houseBalance : wallet.balance;
    if (b !== null && b < bet) {
      stopAuto();
      setStatus({ kind: 'error', text: t('slotsPremium.autoStoppedFunds') });
      return;
    }
    const id = window.setTimeout(() => {
      if (!mounted.current || autoRef.current <= 0) return;
      setAutoLeft((n) => Math.max(0, n - 1));
      void spinRef.current();
    }, tier === 'small' ? 1100 : 500);
    return () => window.clearTimeout(id);
    // Runs once per presented result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presented]);

  const startAuto = (n: number) => {
    setAutoMenu(false);
    setAutoLeft(n - 1);
    autoRef.current = n - 1;
    void spin();
  };

  // Auto never runs unattended: it stops when the app goes to the background.
  useEffect(() => {
    const onHide = () => document.hidden && stopAuto();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stopAuto]);

  // Space spins when nothing else has focus and no sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || sheet || e.target !== document.body) return;
      e.preventDefault();
      onSpinButtonRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);
  const onSpinButtonRef = useRef(onSpinButton);
  onSpinButtonRef.current = onSpinButton;

  // ---------- win lines: all together, then one by one ----------
  useEffect(() => {
    if (!shown || shown.wins.length < 2) return;
    let i = 0;
    const id = window.setInterval(() => {
      setFocusLine(shown.wins[i % shown.wins.length].line);
      i++;
    }, 1400);
    return () => window.clearInterval(id);
  }, [shown]);

  const rolled = useCountUp(shown?.receipt.payout ?? 0, ROLL_MS[shown?.tier ?? 'none'], shown?.id, skip || reduced, (v) => {
    const now = performance.now();
    if (v > 0 && now - lastCoin.current > 110) {
      lastCoin.current = now;
      slotSound('coin');
    }
  });

  // ---------- derived view ----------
  const winsShown = phase === 'presenting' || phase === 'idle' ? shown?.wins ?? [] : [];
  const visibleWins = focusLine === null ? winsShown : winsShown.filter((w) => w.line === focusLine);
  const highlight = useMemo(() => {
    if (!visibleWins.length) return null;
    const set = new Set<string>();
    for (const w of visibleWins) for (const [reel, row] of winCells(w)) set.add(`${reel}:${row}`);
    return set;
  }, [visibleWins]);

  const reelWidth = windowWidth > 0 ? (windowWidth - 8 - 4 * (REELS - 1)) / REELS : 60;
  const heightBudget = (viewportH - (sideways ? 235 : 400)) / 3;
  const cellHeight = Math.round(Math.max(52, Math.min(132, reelWidth * 1.3, Math.max(52, heightBudget))));

  const canAfford = displayBalance === null || bet <= displayBalance;
  const idleLike = phase === 'idle' || phase === 'presenting';
  const betLocked = !idleLike || autoLeft > 0;
  const nextAffordable = (i: number) => displayBalance === null || BET_LEVELS[i] <= displayBalance;
  const betIndex = BET_LEVELS.indexOf(bet as (typeof BET_LEVELS)[number]);
  const changeBet = (i: number) => {
    const next = BET_LEVELS[Math.max(0, Math.min(BET_LEVELS.length - 1, i))];
    setBet(next);
    storage.set(BET_KEY, next);
    slotSound('click');
    if (status?.kind === 'error') setStatus(null);
  };
  const betMax = () => {
    let i = BET_LEVELS.length - 1;
    while (i > 0 && !nextAffordable(i)) i--;
    changeBet(i);
  };

  let spinState: 'idle' | 'spinning' | 'stop' | 'win' | 'disabled' = 'idle';
  if (phase === 'requesting' || phase === 'booting') spinState = 'spinning';
  else if (phase === 'landing') spinState = 'stop';
  else if (phase === 'blocked' || (!canAfford && autoLeft === 0)) spinState = 'disabled';
  else if (celebrating) spinState = 'win';
  const spinLabel = autoLeft > 0 && spinState !== 'stop' ? t('slotsPremium.stopAuto') : spinState === 'stop' ? t('slotsPremium.stop') : t('slotsPremium.spin');

  const tier = shown?.tier ?? 'none';
  let statusView: Status | null = status;
  if (!statusView && shown && (phase === 'presenting' || phase === 'idle') && !shown.recovered) {
    const focused = focusLine !== null ? shown.wins.find((w) => w.line === focusLine) : null;
    if (focused) statusView = { kind: 'win', text: t('slotsPremium.lineWin', { line: focused.line + 1, count: focused.count, symbol: t(`slotsPremium.sym.${theme.symbols[focused.symbol].label}`), amount: focused.amount.toLocaleString() }) };
    else if (tier === 'none') statusView = { kind: 'info', text: t('slotsPremium.noWin') };
    else if (tier === 'tiny') statusView = { kind: 'info', text: t('slotsPremium.tinyWin', { amount: shown.receipt.payout.toLocaleString() }) };
    else statusView = { kind: 'win', text: t('slotsPremium.youWin', { amount: shown.receipt.payout.toLocaleString() }) };
  }
  if (!statusView && (phase === 'requesting' || phase === 'landing')) statusView = { kind: 'info', text: t('slotsPremium.spinning') };
  if (!statusView && phase === 'idle' && !canAfford) statusView = { kind: 'error', text: t('slotsPremium.lowerBet') };
  if (!statusView) statusView = { kind: 'info', text: t('slotsPremium.ready') };

  const gridLabel = visibleGrid(stopsRef.current)
    .map((col, r) => t('slotsPremium.reelAria', { n: r + 1, symbols: col.map((s) => t(`slotsPremium.sym.${theme.symbols[s].label}`)).join(', ') }))
    .join('. ');
  const machineName = t(`slotsPremium.machines.${machine}.name`);
  const lit = (phase === 'presenting' || celebrating) && shown && tier !== 'none' && tier !== 'tiny' ? `ps-lit-${tier}` : '';

  const dock = (
    <div className={sideways ? 'ps-controls-side' : ''}>
      <div className="ps-dock">
        <div className="ps-bet" role="group" aria-label={t('slotsPremium.bet')}>
          <button type="button" className="ps-round" onClick={() => changeBet(betIndex - 1)} disabled={betLocked || betIndex <= 0} aria-label={t('slotsPremium.betLess')}>
            <Minus className="w-4 h-4" />
          </button>
          <div className="ps-bet-value">
            <label>{t('slotsPremium.bet')}</label>
            <strong aria-live="polite">{bet.toLocaleString()}</strong>
          </div>
          <button type="button" className="ps-round" onClick={() => changeBet(betIndex + 1)} disabled={betLocked || betIndex >= BET_LEVELS.length - 1 || !nextAffordable(betIndex + 1)} aria-label={t('slotsPremium.betMore')}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          className={`ps-spin is-${spinState === 'idle' ? 'ready' : spinState}`}
          onClick={onSpinButton}
          disabled={spinState === 'spinning' || spinState === 'disabled'}
          aria-label={spinState === 'stop' ? t('slotsPremium.stopAria') : t('slotsPremium.spinAria', { amount: bet })}
          aria-busy={spinState === 'spinning'}
        >
          {spinLabel}
          {autoLeft > 0 && <small>{t('slotsPremium.autoLeft', { n: autoLeft })}</small>}
        </button>
        <div className="ps-side relative">
          <button type="button" className="ps-round" onClick={betMax} disabled={betLocked} aria-label={t('slotsPremium.betMaxAria')}>
            {t('slotsPremium.max')}
          </button>
          <button
            type="button"
            className={`ps-round ${autoLeft > 0 ? 'is-on' : ''}`}
            onClick={() => (autoLeft > 0 ? stopAuto() : setAutoMenu((v) => !v))}
            disabled={autoLeft === 0 && (!idleLike || !canAfford)}
            aria-expanded={autoMenu}
            aria-label={autoLeft > 0 ? t('slotsPremium.stopAuto') : t('slotsPremium.auto')}
          >
            {t('slotsPremium.autoShort')}
          </button>
          {autoMenu && (
            <div className="ps-auto-menu" role="menu">
              <p>{t('slotsPremium.autoHint')}</p>
              {AUTO_OPTIONS.map((n) => (
                <button key={n} type="button" role="menuitem" className="ps-chip-btn justify-center" onClick={() => startAuto(n)}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ps-tools">
        <button type="button" className="ps-chip-btn" onClick={() => setSheet('history')}>
          <History className="w-4 h-4" aria-hidden /> {t('slotsPremium.history')}
        </button>
        <button type="button" className="ps-chip-btn" onClick={() => setPreference('sound', !preferences.sound)} aria-pressed={!preferences.sound} aria-label={preferences.sound ? t('slotsPremium.mute') : t('slotsPremium.unmute')}>
          {preferences.sound ? <Volume2 className="w-4 h-4" aria-hidden /> : <VolumeX className="w-4 h-4" aria-hidden />}
          <span className="hidden min-[360px]:inline">{preferences.sound ? t('slotsPremium.soundOn') : t('slotsPremium.soundOff')}</span>
        </button>
        {phase === 'blocked' && (
          <button type="button" className="ps-chip-btn" onClick={() => void recover()}>
            <RotateCw className="w-4 h-4" aria-hidden /> {t('slotsPremium.retry')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <CasinoFrame
      title={machineName}
      subtitle={t(`slotsPremium.machines.${machine}.tag`)}
      back="slotLobby"
      scenario="lounge"
      onHelp={() => setSheet('rules')}
      dock={sideways ? undefined : dock}
      maxWidth={sideways ? 'max-w-5xl' : 'max-w-2xl'}
      balanceOverride={displayBalance}
      allowRefill={!remote && idleLike && held === null}
    >
      {burst > 0 && !reduced && <Particles burstId={burst} count={PARTICLES[tier]} colors={theme.particles} />}
      {sheet === 'rules' && <SlotRulesSheet theme={theme} bet={bet} remote={remote} onClose={() => setSheet(null)} />}
      {sheet === 'history' && <SlotHistorySheet items={history} language={language} onClose={() => setSheet(null)} />}

      <div className={sideways ? 'flex items-center gap-3' : 'contents'}>
      <section className={`ps-machine ${sideways ? 'flex-1 min-w-0' : ''} ${phase === 'requesting' || phase === 'landing' ? 'is-spinning' : ''} ${lit}`} style={themeStyle(theme)} aria-label={t('slotsPremium.machineAria', { name: machineName })}>
        <div className="ps-cabinet">
          <div className="ps-bulbs" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} className="ps-bulb" style={{ '--i': i } as React.CSSProperties} />
            ))}
          </div>
          <header className="ps-marquee">
            <h2 className="ps-logo">{machineName}</h2>
            <p className="ps-tag">{t(`slotsPremium.machines.${machine}.tag`)}</p>
          </header>
          <div className="ps-frame">
            <div ref={windowRef} className={`ps-window ${voided ? 'opacity-60' : ''}`} role="img" aria-label={phase === 'idle' || phase === 'presenting' ? gridLabel : t('slotsPremium.spinning')} style={{ '--ch': `${cellHeight}px` } as React.CSSProperties}>
              <ReelSet ref={reels} theme={theme} initialStops={initialStops} cellHeight={cellHeight} reduced={reduced} highlight={highlight} onReelLand={onReelLand} />
              <svg className="ps-lines" style={banner ? { opacity: 0 } : undefined} viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden>
                {visibleWins.map((w) => (
                  <polyline
                    key={`${shown?.id}-${w.line}-${focusLine ?? 'all'}`}
                    className="ps-line"
                    points={LINES[w.line].map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' ')}
                    stroke={LINE_COLORS[w.line]}
                    vectorEffect="non-scaling-stroke"
                    style={{ strokeWidth: tier === 'tiny' ? 3 : 5 }}
                  />
                ))}
              </svg>
              <div className="ps-glass" aria-hidden />
              {banner && shown && BIG_TIERS.includes(shown.tier) && (
                <button type="button" className="ps-banner" onClick={() => (celebrating ? skipCelebration() : setBanner(false))} aria-label={t('slotsPremium.skip')}>
                  <span className="ps-banner-title">{t(`slotsPremium.tiers.${shown.tier}`)}</span>
                  <span className="ps-banner-amount">{rolled.toLocaleString()}</span>
                  <span className="ps-banner-hint">{t('slotsPremium.tapToSkip')}</span>
                </button>
              )}
            </div>
          </div>
          <div className="ps-meter">
            <div className="ps-winbox">
              <label>{t('slotsPremium.win')}</label>
              <strong>{phase === 'requesting' || phase === 'landing' ? '—' : rolled.toLocaleString()}</strong>
            </div>
            <p className={`ps-status ${statusView.kind === 'error' ? 'is-error' : statusView.kind === 'win' ? 'is-win' : ''}`} role="status" aria-live="polite">
              {statusView.text}
            </p>
          </div>
        </div>
      </section>
      {sideways && dock}
      </div>

      <p className="ps-mode justify-center">
        {remote ? <Server className="w-3.5 h-3.5" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
        {remote ? t('slotsPremium.modeRemote') : t('slotsPremium.modeLocal')}
        <button type="button" className="underline underline-offset-2 inline-flex items-center gap-1" onClick={() => setSheet('rules')}>
          <Info className="w-3 h-3" aria-hidden />
          {t('slotsPremium.howItWorks')}
        </button>
      </p>
    </CasinoFrame>
  );
}

/** Reel stops of the last spin shown on this machine (a real past result, not a new one). */
function lastStops(machine: MachineId): number[] {
  const booked = storage.get<unknown>(RECEIPTS_KEY);
  if (Array.isArray(booked)) {
    const r = booked.find((x) => x && x.machine === machine);
    if (r && isValidStops(r.stops)) return [...r.stops];
  }
  // First visit: a cosmetic starting position, not a result.
  return drawStops(cryptoUint32);
}
