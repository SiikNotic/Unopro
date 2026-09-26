import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Info, Minus, Plus, RotateCw, Server, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { ReelSet } from '@/components/slots/ReelSet';
import type { ReelSetHandle } from '@/components/slots/ReelSet';
import { Particles } from '@/components/slots/Particles';
import { Cabinet, MachineBackdrop, MachineLogo } from '@/components/slots/Cabinet';
import { machineArt } from '@/components/slots/art3d';
import { isLiteDevice } from '@/components/slots/device';
import { GLYPHS } from '@/components/slots/glyphs';
import { SlotHistorySheet, SlotRulesSheet } from '@/components/slots/SlotSheets';
import { PRESENTATION } from '@/components/slots/presentation';
import type { LineStyle } from '@/components/slots/presentation';
import '@/components/slots/premiumSlots.css';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { useAccount } from '@/account/useAccount';
import { usePreferences, vibrate } from '@/settings/usePreferences';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useElementWidth } from '@/hooks/useViewport';
import { useCountUp } from '@/hooks/useCountUp';
import { storage } from '@/storage';
import { cryptoUint32, gridOf, isMachineId, isValidBetFor, isValidStopsFor, REELS, settleRound, stripsOf, uniform, winCells } from '@/casino/premium/engine';
import type { JackpotTier, LineWin, MachineId, MachineMath, RoundResult, SpinResult, WinTier } from '@/casino/premium/engine';
import { MACHINES } from '@/casino/premium/machines';
import { asSpinError, newRequestId, spinWithRecovery } from '@/casino/premium/service';
import type { SpinReceipt } from '@/casino/premium/service';
import { receiptStore, useSlotService } from '@/casino/premium/useSlotService';
import { readReceipts } from '@/casino/premium/localHouse';
import { addHistory, clearPending, loadHistory, loadPending, savePending } from '@/casino/premium/journal';
import type { HistoryItem } from '@/casino/premium/journal';
import { slotSound, startReelLoop, stopReelLoop } from '@/audio/slotAudio';
import { startAmbient, stopAmbient } from '@/audio/ambient';
import { suspendMusic } from '@/audio/music';

const AUTO_OPTIONS = [10, 25, 50, 100];
const BIG_TIERS: WinTier[] = ['big', 'mega', 'jackpot'];
/** How long the celebration rolls up, by tier (ms). Nothing rolls for a partial refund. */
const ROLL_MS: Record<WinTier, number> = { none: 0, tiny: 0, small: 700, big: 2400, mega: 3600, jackpot: 5200 };
const PARTICLES: Record<WinTier, number> = { none: 0, tiny: 0, small: 0, big: 55, mega: 100, jackpot: 150 };

const LINE_COLORS: Record<LineStyle, string[]> = {
  bulb: ['#ffd24a', '#ff4d4d', '#7cf07c', '#6ab8ff', '#ff8ad8'],
  light: ['#ffffff', '#e8f6ff', '#fff4d6'],
  gold: ['#ffe08a', '#ffd34d', '#fff3c4'],
  fire: ['#ffb020', '#ff4d00', '#fff1c1'],
  tide: ['#ff6f59', '#ffb74a', '#ffffff', '#ff8fb1'],
  route: ['#9b1b1b', '#2b1d14'],
  neon: ['#35e0ff', '#ff3dcb', '#9d7bff'],
  deco: ['#f1dfae', '#c9a24a'],
};

type Phase = 'booting' | 'idle' | 'requesting' | 'showing' | 'blocked';

interface Status {
  kind: 'info' | 'error' | 'win';
  text: string;
}

interface Stage {
  lines: LineWin[];
  highlight: Set<string> | null;
  rings: [number, number][];
  expanded: number[];
  badges: { reel: number; row: number; text: string }[];
  orb: string | null;
}

type Feature =
  | { kind: 'free-intro'; count: number }
  | { kind: 'free-end'; total: number }
  | { kind: 'picks'; values: number[]; opened: number[]; slots: number; total: number }
  | { kind: 'jackpot'; tier: JackpotTier; amount: number };

const EMPTY_STAGE: Stage = { lines: [], highlight: null, rings: [], expanded: [], badges: [], orb: null };

const betKey = (m: MachineId) => `carta.slots.bet.${m}`;

/** The last two reels hold back only when something big is really possible after three reels. */
function isTease(m: MachineMath, spin: SpinResult): boolean {
  const scatter = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'scatter');
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const firstThree = spin.grid.slice(0, 3);
  if (scatter && firstThree.filter((col) => col.includes(scatter)).length >= 2) return true;
  return m.lines.some((rows) => {
    const syms = rows.slice(0, 3).map((row, reel) => firstThree[reel][row]);
    const base = syms.find((s) => s !== wild) ?? wild;
    return (base === m.top || base === wild) && syms.every((s) => s === base || s === wild);
  });
}

function stageOf(m: MachineMath, spin: SpinResult): Stage {
  const scatter = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'scatter');
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const set = new Set<string>();
  for (const w of spin.lines) for (const [r, row] of winCells(m, w)) set.add(`${r}:${row}`);
  const rings: [number, number][] = [];
  if (scatter && spin.scatters >= 3) spin.grid.forEach((col, r) => col.forEach((s, row) => s === scatter && (rings.push([r, row]), set.add(`${r}:${row}`))));
  const badges: Stage['badges'] = [];
  if (spin.wildMult > 1 && wild) spin.grid.forEach((col, r) => col.forEach((s, row) => s === wild && badges.push({ reel: r, row, text: `×${spin.wildMult}` })));
  return { lines: spin.lines, highlight: set.size ? set : null, rings, expanded: spin.expanded, badges, orb: spin.winMult > 1 ? `×${spin.winMult}` : null };
}

export function PremiumSlotScreen() {
  const { params } = useNavigation();
  const machine: MachineId = isMachineId(params.machine) ? params.machine : 'lucky7s';
  // A different machine is a fresh screen: nothing carries over between machines.
  return <Machine key={machine} machine={machine} />;
}

function Machine({ machine }: { machine: MachineId }) {
  const { t, language } = useI18n();
  const math = MACHINES[machine];
  const look = PRESENTATION[machine];
  const art = machineArt(machine);
  const service = useSlotService();
  const wallet = useWallet();
  const { preferences, setPreference } = usePreferences();
  const reduced = useReducedMotion();
  const [lite] = useState(() => isLiteDevice());
  const remote = service.mode === 'remote';

  const reels = useRef<ReelSetHandle>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const windowWidth = useElementWidth(windowRef);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  // Phone held sideways: machine and controls side by side instead of stacked.
  const sideways = viewport.w > viewport.h && viewport.h < 520;

  const [initialStops] = useState<number[]>(() => lastStops(math));
  const stopsRef = useRef(initialStops);
  const [phase, setPhase] = useState<Phase>(() => (loadPending() ? 'booting' : 'idle'));
  const [bet, setBet] = useState(() => {
    const b = storage.get<unknown>(betKey(machine));
    return isValidBetFor(math, b) ? b : math.betLevels[0];
  });
  const [round, setRound] = useState<{ receipt: SpinReceipt; result: RoundResult; recovered: boolean; id: number } | null>(null);
  const [stage, setStage] = useState<Stage>(EMPTY_STAGE);
  const [feature, setFeature] = useState<Feature | null>(null);
  const [freeInfo, setFreeInfo] = useState<{ i: number; n: number; mult: number; total: number } | null>(null);
  const [meter, setMeter] = useState(0);
  const [banner, setBanner] = useState<{ tier: WinTier; amount: number; id: number } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [houseBalance, setHouseBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [sheet, setSheet] = useState<'rules' | 'history' | null>(null);
  const [menu, setMenu] = useState<'auto' | 'sound' | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const [voided, setVoided] = useState(false);
  const [burst, setBurst] = useState(0);
  const [shake, setShake] = useState(false);
  const [presented, setPresented] = useState(0);

  // Refs: the source of truth for guards (state lags a render behind a fast double tap).
  const busy = useRef(phase === 'booting');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const autoRef = useRef(0);
  autoRef.current = autoLeft;
  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);
  const waits = useRef(new Set<() => void>());
  const fast = useRef(false);
  const showToken = useRef(0);
  const pickResolve = useRef<(() => void) | null>(null);
  const meterFrame = useRef(0);
  const lastCoin = useRef(0);
  const tease = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const pendingWaits = waits.current;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      timers.current.forEach((id) => window.clearTimeout(id));
      [...pendingWaits].forEach((r) => r());
      cancelAnimationFrame(meterFrame.current);
      stopReelLoop();
    };
  }, []);

  // The machine's own ambient music replaces the lobby music while you're here.
  useEffect(() => {
    suspendMusic(true);
    return () => {
      stopAmbient();
      suspendMusic(false);
    };
  }, []);
  useEffect(() => {
    if (preferences.sound && preferences.music && preferences.musicVolume > 0) startAmbient(machine, preferences.musicVolume);
    else stopAmbient();
  }, [machine, preferences.sound, preferences.music, preferences.musicVolume]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const refreshHouseBalance = useCallback(async () => {
    if (!remote) return;
    try {
      const b = await service.balance();
      if (mounted.current) setHouseBalance(b);
    } catch {
      // shown as unknown; every receipt carries the balance anyway
    }
  }, [remote, service]);
  useEffect(() => void refreshHouseBalance(), [refreshHouseBalance]);

  // Signed in: keep the account balance (home, profile) in step with what the server answered.
  const account = useAccount();
  const setAccountBalance = account.setBalance;
  useEffect(() => {
    if (wallet.mode === 'account' && typeof houseBalance === 'number') setAccountBalance(houseBalance);
  }, [wallet.mode, houseBalance, setAccountBalance]);

  const liveBalance = remote ? houseBalance : wallet.balance;
  const displayBalance = held ?? liveBalance;

  const stopAuto = useCallback(() => {
    setAutoLeft(0);
    autoRef.current = 0;
  }, []);

  // ---------- timing helpers: every wait can be cut short (SPIN to skip) and dies with the screen ----------
  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const done = () => {
        waits.current.delete(done);
        window.clearTimeout(id);
        resolve();
      };
      const id = window.setTimeout(done, fast.current || reduced ? Math.min(ms, 120) : ms);
      waits.current.add(done);
    });
  }, [reduced]);
  const skipAll = useCallback(() => {
    fast.current = true;
    reels.current?.hurry();
    [...waits.current].forEach((r) => r());
  }, []);

  const tweenMeter = useCallback(
    (from: number, to: number, ms: number) =>
      new Promise<void>((resolve) => {
        cancelAnimationFrame(meterFrame.current);
        if (to <= from || ms <= 0 || fast.current || reduced) {
          setMeter(to);
          resolve();
          return;
        }
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / ms);
          setMeter(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
          if (now - lastCoin.current > 110) {
            lastCoin.current = now;
            slotSound(machine, 'coin');
          }
          if (p < 1 && !fast.current && mounted.current) meterFrame.current = requestAnimationFrame(step);
          else {
            setMeter(to);
            resolve();
          }
        };
        meterFrame.current = requestAnimationFrame(step);
      }),
    [machine, reduced]
  );

  // ---------- playing back a round the house already decided ----------
  const finish = useCallback((id: number) => {
    setHeld(null);
    setFreeInfo(null);
    setFeature(null);
    busy.current = false;
    setPhase('idle');
    setPresented(id);
  }, []);

  const show = useCallback(
    async (receipt: SpinReceipt) => {
      const token = ++showToken.current;
      const alive = () => mounted.current && showToken.current === token;
      const res = settleRound(math, receipt.bet, receipt.draws);
      const id = Date.now();
      setRound({ receipt, result: res, recovered: false, id });
      setMeter(0);
      let total = 0;

      // Base spin
      tease.current = !reduced && isTease(math, res.base);
      if (tease.current) setStatus({ kind: 'info', text: t('slotsPremium.suspense') });
      await reels.current?.land(res.base.stops, { tease: tease.current });
      if (!alive()) return;
      stopReelLoop();
      stopsRef.current = res.base.stops;
      setStatus(null);
      setStage(stageOf(math, res.base));
      if (res.base.expanded.length) slotSound(machine, 'feature');
      if (res.base.winMult > 1) {
        slotSound(machine, 'feature');
        await wait(1000);
      }
      if (res.base.payout > 0) {
        await tweenMeter(0, res.base.payout, 500);
        total = res.base.payout;
        await wait(res.free.length || res.picks.length || res.jackpot ? 1000 : 150);
      }
      if (!alive()) return;

      // Jackpot ladder (Royal Jackpot)
      if (res.jackpot) {
        setFeature({ kind: 'jackpot', tier: res.jackpot, amount: res.jackpotWin });
        slotSound(machine, res.jackpot === 'minor' ? 'big' : 'jackpot');
        vibrate(preferences.haptics, [60, 40, 90]);
        await wait(3200);
        if (!alive()) return;
        setFeature(null);
        await tweenMeter(total, total + res.jackpotWin, 900);
        total += res.jackpotWin;
      }

      // Pick bonus (Golden Fortune coins, Pirate's Gold chests): the prizes were drawn with the round;
      // picking only reveals them, in order.
      if (res.picks.length) {
        slotSound(machine, 'feature');
        const slots = math.features.pickBonus?.kind === 'coins' ? 9 : 6;
        setFeature({ kind: 'picks', values: res.picks, opened: [], slots, total: 0 });
        setStatus({ kind: 'info', text: t(`slotsPremium.bonus.${math.features.pickBonus?.kind}.pick`, { n: res.picks.length }) });
        await new Promise<void>((resolve) => {
          const done = () => {
            waits.current.delete(done);
            resolve();
          };
          pickResolve.current = done;
          waits.current.add(done);
        });
        pickResolve.current = null;
        if (!alive()) return;
        await wait(1300);
        if (!alive()) return;
        setFeature(null);
        setStatus(null);
        await tweenMeter(total, total + res.pickWin, 900);
        total += res.pickWin;
      }

      // Free spins: every spin was drawn with the round; the reels just play them back.
      if (res.free.length) {
        setStage(EMPTY_STAGE);
        setFeature({ kind: 'free-intro', count: res.freeAwarded });
        slotSound(machine, 'feature');
        await wait(1800);
        if (!alive()) return;
        setFeature(null);
        let freeTotal = 0;
        for (let i = 0; i < res.free.length; i++) {
          const f = res.free[i];
          setFreeInfo({ i: i + 1, n: res.free.length, mult: f.freeMult, total: freeTotal });
          setStage(EMPTY_STAGE);
          reels.current?.start();
          slotSound(machine, 'spin');
          await wait(420);
          if (!alive()) return;
          await reels.current?.land(f.stops, { tease: false });
          if (!alive()) return;
          stopsRef.current = f.stops;
          setStage(stageOf(math, f));
          if (f.payout > 0) {
            slotSound(machine, 'reveal');
            await tweenMeter(total, total + f.payout, 380);
            total += f.payout;
            freeTotal += f.payout;
            setFreeInfo({ i: i + 1, n: res.free.length, mult: f.freeMult, total: freeTotal });
            await wait(f.winMult > 1 ? 1100 : 700);
          } else await wait(260);
          if (!alive()) return;
        }
        setFeature({ kind: 'free-end', total: freeTotal });
        await wait(1700);
        if (!alive()) return;
        setFeature(null);
        setFreeInfo(null);
      }
      if (total !== receipt.payout) setMeter(receipt.payout); // the max-win cap, if it applied

      // Final celebration, scaled to the whole round
      const tier = res.tier;
      const sound = { none: null, tiny: 'coin', small: 'small', big: 'big', mega: 'mega', jackpot: 'jackpot' } as const;
      const s = sound[tier];
      if (s) slotSound(machine, s);
      if (BIG_TIERS.includes(tier)) {
        setBanner({ tier, amount: receipt.payout, id });
        vibrate(preferences.haptics, tier === 'big' ? 60 : [60, 40, 90]);
        if (!reduced) setBurst(id);
        if (look.celebration.shake && !reduced && tier !== 'big') {
          setShake(true);
          later(900, () => setShake(false));
        }
        await wait(ROLL_MS[tier] + 1400);
        if (!alive()) return;
        setBanner(null);
      } else if (tier === 'small') await wait(ROLL_MS.small);
      if (!alive()) return;
      finish(id);
    },
    [finish, look, machine, math, preferences.haptics, reduced, t, tweenMeter, wait]
  );

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== id);
      if (mounted.current) fn();
    }, ms);
    timers.current.push(id);
  };

  /** A booked round seen again after a reload: shown at rest, with a summary instead of a replay. */
  const showRecovered = useCallback(
    (receipt: SpinReceipt) => {
      const res = settleRound(math, receipt.bet, receipt.draws);
      const last = res.free.length ? res.free[res.free.length - 1] : res.base;
      reels.current?.place(last.stops);
      stopsRef.current = last.stops;
      setRound({ receipt, result: res, recovered: true, id: Date.now() });
      setStage(stageOf(math, last));
      setMeter(receipt.payout);
      setStatus({ kind: receipt.payout > 0 ? 'win' : 'info', text: receipt.payout > 0 ? t('slotsPremium.recoveredWin', { amount: receipt.payout.toLocaleString() }) : t('slotsPremium.recoveredLoss') });
    },
    [math, t]
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
        if (receipt.machine === machine) showRecovered(receipt);
        else setStatus({ kind: 'info', text: t('slotsPremium.recoveredElsewhere', { machine: t(`slotsPremium.machines.${receipt.machine}.name`), amount: receipt.payout.toLocaleString() }) });
      } else setStatus({ kind: 'info', text: t('slotsPremium.neverBooked') });
      busy.current = false;
      setPhase('idle');
    } catch {
      if (!mounted.current) return;
      busy.current = true;
      setPhase('blocked');
      setStatus({ kind: 'error', text: t('slotsPremium.errors.uncertain') });
    }
  }, [machine, remote, service, showRecovered, t]);

  useEffect(() => {
    if (loadPending()) void recover();
    // once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      slotSound(machine, 'error');
      setStatus({ kind: 'error', text: t('slotsPremium.errors.insufficient_funds') });
      stopAuto();
      return;
    }
    busy.current = true;
    fast.current = false;
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    const req = { requestId: newRequestId(), machine, bet };
    // Written before anything is sent, so a reload or a closed tab can always recover the real result.
    savePending({ ...req, at: Date.now() });
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setHeld(balanceNow);
    setPhase('requesting');
    setRound(null);
    setStage(EMPTY_STAGE);
    setBanner(null);
    setFeature(null);
    setMeter(0);
    setVoided(false);
    setStatus(null);
    setMenu(null);
    slotSound(machine, 'click');
    slotSound(machine, 'spin');
    startReelLoop();
    reels.current?.start();

    let receipt: SpinReceipt;
    try {
      receipt = await spinWithRecovery(service, req, {
        signal: ctrl.signal,
        onRetry: () => mounted.current && setStatus({ kind: 'info', text: t('slotsPremium.reconnecting') }),
      });
    } catch (e) {
      if (!mounted.current || ctrl.signal.aborted) return; // left the screen: recovered on the next visit
      const err = asSpinError(e);
      stopReelLoop();
      stopAuto();
      slotSound(machine, 'error');
      await reels.current?.land(stopsRef.current, { tease: false });
      if (!mounted.current) return;
      setHeld(null);
      setVoided(true);
      setStatus({ kind: 'error', text: t(`slotsPremium.errors.${err.code}`) });
      if (err.uncertain) setPhase('blocked'); // maybe booked, maybe not: never guess, recover it
      else {
        clearPending(req.requestId);
        if (err.code === 'insufficient_funds') void refreshHouseBalance();
        busy.current = false;
        setPhase('idle');
      }
      return;
    }
    if (!mounted.current) return;
    // Booked: stake taken, payout credited. Hold the payout out of the shown balance until the show ends.
    setHeld(receipt.balance - receipt.payout);
    if (remote) setHouseBalance(receipt.balance);
    setHistory(addHistory(receipt));
    setPhase('showing');
    await show(receipt);
    // Only now is the round fully shown; until here a reload recovers and shows it.
    if (mounted.current) clearPending(req.requestId);
  }, [bet, displayBalance, machine, refreshHouseBalance, remote, service, show, stopAuto, t]);

  const onReelLand = useCallback(
    (r: number) => {
      slotSound(machine, 'reelStop');
      if (tease.current && r === 2) slotSound(machine, 'anticipation');
    },
    [machine]
  );

  /** The big button: spin; while a round plays, it hurries it along; with auto on, it stops auto. */
  const onSpinButton = () => {
    if (phaseRef.current === 'showing') {
      if (feature?.kind !== 'picks') skipAll();
      return;
    }
    if (autoRef.current > 0) {
      stopAuto();
      return;
    }
    void spin();
  };
  const onSpinRef = useRef(onSpinButton);
  onSpinRef.current = onSpinButton;

  // ---------- pick bonus ----------
  const featureRef = useRef(feature);
  featureRef.current = feature;
  const openPick = (slot: number) => {
    const f = featureRef.current;
    if (!f || f.kind !== 'picks' || f.opened.includes(slot) || f.opened.length >= f.values.length) return;
    const opened = [...f.opened, slot];
    const next = { ...f, opened, total: f.values.slice(0, opened.length).reduce((a, b) => a + b, 0) };
    featureRef.current = next;
    setFeature(next);
    slotSound(machine, 'reveal');
    if (opened.length === f.values.length) pickResolve.current?.();
  };
  // Auto (or waiting too long) reveals the remaining picks.
  useEffect(() => {
    if (feature?.kind !== 'picks' || feature.opened.length >= feature.values.length) return;
    const delay = autoRef.current > 0 || fast.current ? 650 : 9000;
    const id = window.setTimeout(() => {
      const closed = Array.from({ length: feature.slots }, (_, i) => i).filter((i) => !feature.opened.includes(i));
      openPick(closed[uniform(closed.length, cryptoUint32)]);
    }, delay);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  // ---------- auto spin ----------
  const spinRef = useRef(spin);
  spinRef.current = spin;
  useEffect(() => {
    if (!presented || autoRef.current <= 0 || phaseRef.current !== 'idle') return;
    const tier = round?.result.tier ?? 'none';
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
    }, tier === 'small' ? 900 : 450);
    return () => window.clearTimeout(id);
    // Runs once per finished round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presented]);

  const startAuto = (n: number) => {
    setMenu(null);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || sheet || e.target !== document.body) return;
      e.preventDefault();
      onSpinRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  // Several winning lines: all together first, then one at a time.
  const [focusLine, setFocusLine] = useState<number | null>(null);
  useEffect(() => {
    setFocusLine(null);
    if (stage.lines.length < 2 || phase === 'requesting') return;
    let i = 0;
    const id = window.setInterval(() => setFocusLine(stage.lines[i++ % stage.lines.length].line), 1400);
    return () => window.clearInterval(id);
  }, [stage, phase]);
  const visibleLines = focusLine === null ? stage.lines : stage.lines.filter((l) => l.line === focusLine);
  const highlight = useMemo(() => {
    if (focusLine === null) return stage.highlight;
    const set = new Set<string>();
    for (const w of visibleLines) for (const [r, row] of winCells(math, w)) set.add(`${r}:${row}`);
    return set;
  }, [focusLine, math, stage.highlight, visibleLines]);

  const bannerAmount = useCountUp(banner?.amount ?? 0, banner ? ROLL_MS[banner.tier] : 0, banner?.id, reduced);

  // ---------- layout ----------
  const reelWidth = windowWidth > 0 ? (windowWidth - 8 - 4 * (REELS - 1)) / REELS : 60;
  // Lucky 7s carries a taller marquee and, on wide screens, a larger control deck.
  const marquee = machine === 'lucky7s' && !sideways ? (viewport.w >= 900 ? 215 : 70) : 0;
  const heightBudget = (viewport.h - marquee - (sideways ? (machine === 'royal' ? 235 : 195) : machine === 'royal' ? 460 : 410)) / 3;
  const cellHeight = Math.round(Math.max(52, Math.min(128, reelWidth * 1.25, Math.max(52, heightBudget))));

  const canAfford = displayBalance === null || bet <= displayBalance;
  const idle = phase === 'idle';
  const betLocked = !idle || autoLeft > 0;
  const affordable = (i: number) => displayBalance === null || math.betLevels[i] <= displayBalance;
  const betIndex = math.betLevels.indexOf(bet);
  const changeBet = (i: number) => {
    const next = math.betLevels[Math.max(0, Math.min(math.betLevels.length - 1, i))];
    setBet(next);
    storage.set(betKey(machine), next);
    slotSound(machine, 'click');
    if (status?.kind === 'error') setStatus(null);
  };
  const betMax = () => {
    let i = math.betLevels.length - 1;
    while (i > 0 && !affordable(i)) i--;
    changeBet(i);
  };

  let spinState: 'idle' | 'spinning' | 'stop' | 'feature' | 'disabled' = 'idle';
  if (phase === 'requesting' || phase === 'booting') spinState = 'spinning';
  else if (phase === 'showing') spinState = feature?.kind === 'picks' ? 'feature' : 'stop';
  else if (phase === 'blocked' || (!canAfford && autoLeft === 0) || (!remote && !wallet.activeHere)) spinState = 'disabled';
  const spinLabel =
    autoLeft > 0 && phase !== 'showing' ? t('slotsPremium.stopAuto') : spinState === 'stop' ? t('slotsPremium.skipShort') : spinState === 'feature' ? t('slotsPremium.pickShort') : t('slotsPremium.spin');

  const res = round?.result;
  let statusView = status;
  if (!statusView && res && !round?.recovered && phase !== 'requesting') {
    const focused = focusLine !== null ? stage.lines.find((l) => l.line === focusLine) : null;
    if (focused) statusView = { kind: 'win', text: t('slotsPremium.lineWin', { line: focused.line + 1, count: focused.count, symbol: t(`slotsPremium.sym.${look.symbols[focused.symbol].label}`), amount: Math.floor(focused.amount).toLocaleString() }) };
    else if (phase === 'showing') statusView = null;
    else if (res.tier === 'none') statusView = { kind: 'info', text: t('slotsPremium.noWin') };
    else if (res.tier === 'tiny') statusView = { kind: 'info', text: t('slotsPremium.tinyWin', { amount: round!.receipt.payout.toLocaleString() }) };
    else statusView = { kind: 'win', text: t('slotsPremium.youWin', { amount: round!.receipt.payout.toLocaleString() }) };
  }
  if (!statusView && phase === 'showing' && meter > 0 && !freeInfo) statusView = { kind: 'win', text: t('slotsPremium.youWin', { amount: meter.toLocaleString() }) };
  if (!statusView && (phase === 'requesting' || phase === 'showing')) statusView = { kind: 'info', text: freeInfo ? t('slotsPremium.freeSpinOf', { i: freeInfo.i, n: freeInfo.n }) : t('slotsPremium.spinning') };
  if (!statusView && idle && !canAfford) statusView = { kind: 'error', text: t('slotsPremium.lowerBet') };
  if (!statusView) statusView = { kind: 'info', text: t(`slotsPremium.machines.${machine}.ready`) };

  const grid = gridOf(math, stopsRef.current);
  const gridLabel = grid.map((col, r) => t('slotsPremium.reelAria', { n: r + 1, symbols: col.map((s) => t(`slotsPremium.sym.${look.symbols[s].label}`)).join(', ') })).join('. ');
  const machineName = t(`slotsPremium.machines.${machine}.name`);
  const lineColors = LINE_COLORS[look.lineStyle];
  const celebrating = !!banner || (phase === 'showing' && !!res && res.tier !== 'none' && res.tier !== 'tiny');
  const ladder = math.features.jackpotLadder;

  const volume = (id: string, label: string, value: number, onChange: (v: number) => void) => (
    <label htmlFor={id} className="block mt-2 text-[11px] text-[var(--cz-muted)]">
      {label}
      <input id={id} type="range" min={0} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="mc-range" />
    </label>
  );

  const dock = (
    <div className={`mc-${machine}`} style={look.palette as React.CSSProperties}>
      <div className={sideways ? 'mc-side-controls' : ''}>
        <div className="mc-dock">
          <div className="mc-bet" role="group" aria-label={t('slotsPremium.bet')}>
            <button type="button" className="mc-key" onClick={() => changeBet(betIndex - 1)} disabled={betLocked || betIndex <= 0} aria-label={t('slotsPremium.betLess')}>
              <Minus className="w-4 h-4" />
            </button>
            <div className="mc-bet-value">
              <label>{t('slotsPremium.bet')}</label>
              <strong aria-live="polite">{bet.toLocaleString()}</strong>
            </div>
            <button type="button" className="mc-key" onClick={() => changeBet(betIndex + 1)} disabled={betLocked || betIndex >= math.betLevels.length - 1 || !affordable(betIndex + 1)} aria-label={t('slotsPremium.betMore')}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            className={`mc-spin is-${spinState === 'idle' ? (celebrating ? 'win' : 'ready') : spinState} ${art.spin ? 'has-3d' : ''}`}
            style={art.spin ? ({ '--spin-art': `url(${art.spin})` } as React.CSSProperties) : undefined}
            onClick={onSpinButton}
            disabled={spinState === 'spinning' || spinState === 'disabled' || spinState === 'feature'}
            aria-label={spinState === 'stop' ? t('slotsPremium.skipAria') : t('slotsPremium.spinAria', { amount: bet })}
            aria-busy={spinState === 'spinning'}
          >
            {spinLabel}
            {autoLeft > 0 && <small>{t('slotsPremium.autoLeft', { n: autoLeft })}</small>}
          </button>
          <div className="mc-side">
            <button type="button" className="mc-key" onClick={betMax} disabled={betLocked} aria-label={t('slotsPremium.betMaxAria')}>
              {t('slotsPremium.max')}
            </button>
            <button
              type="button"
              className={`mc-key ${autoLeft > 0 ? 'is-on' : ''}`}
              onClick={() => (autoLeft > 0 ? stopAuto() : setMenu((m) => (m === 'auto' ? null : 'auto')))}
              disabled={autoLeft === 0 && (!idle || !canAfford)}
              aria-expanded={menu === 'auto'}
              aria-label={autoLeft > 0 ? t('slotsPremium.stopAuto') : t('slotsPremium.auto')}
            >
              {t('slotsPremium.autoShort')}
            </button>
            {menu === 'auto' && (
              <div className="mc-pop" role="menu">
                <p>{t('slotsPremium.autoHint')}</p>
                <div className="mc-pop-grid">
                  {AUTO_OPTIONS.map((n) => (
                    <button key={n} type="button" role="menuitem" className="mc-chip justify-center" onClick={() => startAuto(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mc-tools relative">
        <button type="button" className="mc-chip" onClick={() => setSheet('history')}>
          <History className="w-4 h-4" aria-hidden /> {t('slotsPremium.history')}
        </button>
        <button type="button" className="mc-chip" onClick={() => setMenu((m) => (m === 'sound' ? null : 'sound'))} aria-expanded={menu === 'sound'} aria-label={t('slotsPremium.soundSettings')}>
          {preferences.sound ? <Volume2 className="w-4 h-4" aria-hidden /> : <VolumeX className="w-4 h-4" aria-hidden />}
          <span className="hidden min-[360px]:inline">{preferences.sound ? t('slotsPremium.soundOn') : t('slotsPremium.soundOff')}</span>
        </button>
        {phase === 'blocked' && (
          <button type="button" className="mc-chip" onClick={() => void recover()}>
            <RotateCw className="w-4 h-4" aria-hidden /> {t('slotsPremium.retry')}
          </button>
        )}
        {menu === 'sound' && (
          <div className="mc-pop" style={{ right: '50%', transform: 'translateX(50%)' }}>
            <button type="button" className="mc-chip w-full justify-center" onClick={() => setPreference('sound', !preferences.sound)} aria-pressed={!preferences.sound}>
              {preferences.sound ? <VolumeX className="w-4 h-4" aria-hidden /> : <Volume2 className="w-4 h-4" aria-hidden />}
              {preferences.sound ? t('slotsPremium.mute') : t('slotsPremium.unmute')}
            </button>
            {volume('slot-sfx-volume', t('slotsPremium.effectsVolume'), preferences.sfxVolume, (v) => setPreference('sfxVolume', v))}
            {volume('slot-music-volume', t('slotsPremium.musicVolume'), preferences.music ? preferences.musicVolume : 0, (v) => {
              setPreference('music', v > 0);
              setPreference('musicVolume', v);
            })}
          </div>
        )}
      </div>
    </div>
  );

  const PickGlyph = GLYPHS[math.features.pickBonus?.kind === 'coins' ? 'coin' : 'chest'];

  const machineView = (
    <Cabinet id={machine} lite={lite} spinning={phase === 'requesting' || (phase === 'showing' && !feature)} className={`${phase === 'requesting' ? 'is-spinning' : ''} ${celebrating ? 'is-lit' : ''} ${idle ? 'is-idle' : ''} ${shake ? 'mc-shake' : ''} ${sideways ? 'flex-1 min-w-0' : ''}`}>
      {ladder && (
        <div className="ry-ladder" aria-label={t('slotsPremium.ladderAria')}>
          {(['minor', 'major', 'grand'] as const).map((tier, i) => (
            <div key={tier} className={`ry-rung ${tier} ${feature?.kind === 'jackpot' && feature.tier === tier ? 'is-hit' : ''}`}>
              <span>{t(`slotsPremium.jackpots.${tier}`)}</span>
              <strong>{(ladder.tiers[i] * bet).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
      <header className="mc-top">
        <MachineLogo id={machine} name={machineName} as="h2" hero />
        <p className="mc-sub">{t(`slotsPremium.machines.${machine}.tag`)}</p>
      </header>
      <div
        ref={windowRef}
        className={`mc-window ${voided ? 'opacity-60' : ''} ${art.frame ? 'has-3d' : ''}`}
        role="img"
        aria-label={idle ? gridLabel : t('slotsPremium.spinning')}
        style={{ '--ch': `${cellHeight}px`, ...(art.frame ? { '--frame': `url(${art.frame})` } : {}) } as React.CSSProperties}
      >
        {machine === 'pirates' && <span className="pr-compass" aria-hidden />}
        <ReelSet ref={reels} math={math} look={look} initialStops={initialStops} cellHeight={cellHeight} reduced={reduced} highlight={highlight} onReelLand={onReelLand} />
        {machine === 'lucky7s' && <span className="mc-payline" aria-hidden />}
        {machine === 'inferno' && !lite && <span className="if-heat" aria-hidden />}
        <svg className="mc-lines" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden style={banner || feature ? { opacity: 0 } : undefined}>
          {visibleLines.map((w) => (
            <polyline
              key={`${round?.id}-${w.line}-${focusLine ?? 'all'}-${stage.lines.length}`}
              className="mc-line"
              points={math.lines[w.line].map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' ')}
              stroke={lineColors[w.line % lineColors.length]}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="mc-overlay" aria-hidden>
          {stage.expanded.map((r) => (
            <span key={`x${r}`} className="mc-expanded" style={{ gridColumn: r + 1 }} />
          ))}
          {stage.rings.map(([r, row]) => (
            <span key={`r${r}-${row}`} className="mc-ring" style={{ gridColumn: r + 1, gridRow: row + 1 }} />
          ))}
          {stage.badges.map((b) => (
            <span key={`b${b.reel}-${b.row}`} className="mc-badge" style={{ gridColumn: b.reel + 1, gridRow: b.row + 1 }}>
              {b.text}
            </span>
          ))}
        </div>
        {stage.orb && phase === 'showing' && <span className="mc-orb" aria-hidden>{stage.orb}</span>}
        {banner && (
          <button type="button" className="mc-banner" onClick={skipAll} aria-label={t('slotsPremium.skip')}>
            <span className="mc-banner-title">{t(`slotsPremium.tiers.${banner.tier}`)}</span>
            <span className="mc-banner-sub">{t(`slotsPremium.machines.${machine}.cheer`)}</span>
            <span className="mc-banner-amount">{bannerAmount.toLocaleString()}</span>
            <span className="mc-banner-hint">{t('slotsPremium.tapToSkip')}</span>
          </button>
        )}
      </div>
      <div className="mc-meter">
        <div className="mc-win">
          <label>{t('slotsPremium.win')}</label>
          <strong>{phase === 'requesting' ? '—' : meter.toLocaleString()}</strong>
        </div>
        <div className="min-w-0">
          <p className={`mc-status ${statusView.kind === 'error' ? 'is-error' : statusView.kind === 'win' ? 'is-win' : ''}`} role="status" aria-live="polite">
            {statusView.text}
          </p>
          {freeInfo && (
            <p className="mc-free">
              {t('slotsPremium.freeSpinOf', { i: freeInfo.i, n: freeInfo.n })}
              {freeInfo.mult > 1 && <span>· ×{freeInfo.mult}</span>}
            </p>
          )}
        </div>
      </div>

      {feature?.kind === 'free-intro' && (
        <div className="mc-feature" role="status">
          <h3>{t('slotsPremium.free.title', { n: feature.count })}</h3>
          <p>{t(`slotsPremium.machines.${machine}.freeRule`)}</p>
        </div>
      )}
      {feature?.kind === 'free-end' && (
        <div className="mc-feature" role="status">
          <h3>{t('slotsPremium.free.done')}</h3>
          <p className="mc-banner-amount">{feature.total.toLocaleString()}</p>
        </div>
      )}
      {feature?.kind === 'jackpot' && (
        <div className="mc-feature" role="status">
          <h3>{t(`slotsPremium.jackpots.${feature.tier}`)}</h3>
          <p className="mc-banner-amount">{feature.amount.toLocaleString()}</p>
          <p>{t('slotsPremium.jackpots.note')}</p>
        </div>
      )}
      {feature?.kind === 'picks' && (
        <div className="mc-feature" role="dialog" aria-label={t(`slotsPremium.bonus.${math.features.pickBonus?.kind}.title`)}>
          <h3>{t(`slotsPremium.bonus.${math.features.pickBonus?.kind}.title`)}</h3>
          <p>{feature.opened.length < feature.values.length ? t(`slotsPremium.bonus.${math.features.pickBonus?.kind}.pick`, { n: feature.values.length - feature.opened.length }) : t('slotsPremium.bonus.done')}</p>
          <div className="mc-picks" style={feature.slots === 6 ? { gridTemplateColumns: 'repeat(3, 1fr)' } : undefined}>
            {Array.from({ length: feature.slots }, (_, i) => {
              const order = feature.opened.indexOf(i);
              const open = order >= 0;
              return (
                <button key={i} type="button" className={`mc-pick ${open ? 'is-open' : ''}`} disabled={open || feature.opened.length >= feature.values.length} onClick={() => openPick(i)} aria-label={open ? t('slotsPremium.bonus.revealed', { amount: (feature.values[order] * bet).toLocaleString() }) : t('slotsPremium.bonus.choose', { n: i + 1 })}>
                  {open ? <span className="mc-pick-value">{(feature.values[order] * bet).toLocaleString()}</span> : <PickGlyph c1={look.symbols[Object.keys(math.symbols).find((s) => math.symbols[s].kind === 'scatter')!].c1} c2={look.symbols[Object.keys(math.symbols).find((s) => math.symbols[s].kind === 'scatter')!].c2} />}
                </button>
              );
            })}
          </div>
          <p className="mc-banner-amount" style={{ fontSize: 26 }}>
            {(feature.total * bet).toLocaleString()}
          </p>
          <p className="text-[11px] opacity-70">{t('slotsPremium.bonus.fair')}</p>
        </div>
      )}
    </Cabinet>
  );

  return (
    <CasinoFrame
      title={machineName}
      subtitle={t(`slotsPremium.machines.${machine}.tag`)}
      back="slotLobby"
      scenario="lounge"
      backdrop={<MachineBackdrop id={machine} />}
      onHelp={() => setSheet('rules')}
      dock={sideways ? undefined : dock}
      maxWidth={sideways ? 'max-w-5xl' : 'max-w-2xl'}
      balanceOverride={displayBalance}
      allowRefill={!remote && idle && held === null}
    >
      {burst > 0 && !reduced && <Particles burstId={burst} count={Math.round(PARTICLES[res?.tier ?? 'none'] * (lite ? 0.5 : 1))} kind={look.celebration.particle} colors={look.celebration.colors} />}
      {sheet === 'rules' && <SlotRulesSheet machine={machine} bet={bet} remote={remote} onClose={() => setSheet(null)} />}
      {sheet === 'history' && <SlotHistorySheet items={history} language={language} onClose={() => setSheet(null)} />}

      <div className={sideways ? 'flex items-center gap-3' : 'flex-1 flex flex-col justify-center'}>
        {machineView}
        {sideways && dock}
      </div>

      <p className="mc-mode justify-center">
        {remote ? <Server className="w-3.5 h-3.5" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
        {wallet.mode === 'account' ? t('slotsPremium.modeAccount') : remote ? t('slotsPremium.modeRemote') : t('slotsPremium.modeLocal')}
        <button type="button" className="underline underline-offset-2 inline-flex items-center gap-1" onClick={() => setSheet('rules')}>
          <Info className="w-3 h-3" aria-hidden />
          {t('slotsPremium.howItWorks')}
        </button>
      </p>
    </CasinoFrame>
  );
}

/** Reel stops of the last round shown on this machine (a real past result, not a new one). */
function lastStops(math: MachineMath): number[] {
  const r = readReceipts(receiptStore).find((x) => x.machine === math.id);
  const stops = r?.draws.base.stops;
  if (isValidStopsFor(math, stops)) return [...stops];
  // First visit: a cosmetic starting position, not a result.
  return stripsOf(math).map((s) => uniform(s.length, cryptoUint32));
}
