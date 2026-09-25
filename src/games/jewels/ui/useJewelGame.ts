// Plays a Jewellery: Olympus level. Holds the logical state (engine) apart from the visual state (pieces on
// screen, effects, score pops) and plays each move's steps one after another. Event-driven: nothing runs
// between moves except an optional hint timer; every timeout is tracked and cleared on unmount.
//
//   IDLE → SWAPPING → RESOLVING → CLEARING → FALLING/REFILLING → (CASCADING → CLEARING → FALLING)* → IDLE
//   … LEVEL_COMPLETE / LEVEL_FAILED after the last step. Input is ignored unless IDLE.
import { useCallback, useEffect, useRef, useState } from 'react';
import { boardFrom, createGame, goalProgress, hint as findHint, TARGETED, trySwap, applyBooster } from '../engine';
import type { Booster, JewelState, LevelDef, Pos, Special, Step } from '../engine';
import type { JewelPhase } from './Jewel';
import { FX, KIND_GLOW } from './palette';
import { playJewel } from './jewelAudio';
import type { SparkLayer } from './particles';

export interface VPiece {
  id: number;
  kind: number;
  special: Special | null;
  hp?: number;
  r: number;
  c: number;
  phase: JewelPhase;
  dropFrom?: number;
}

export interface Effect {
  id: number;
  type: 'boltRow' | 'boltCol' | 'wave' | 'divine' | 'hammer';
  r: number;
  c: number;
  /** Wave radius in cells. */
  size?: number;
}

export interface ScorePop {
  id: number;
  /** Cell coordinates (fractional) where it appears. */
  r: number;
  c: number;
  points: number;
  big: boolean;
}

export interface Hud {
  score: number;
  movesLeft: number;
  collected: number[];
  iceLeft: number;
  stonesLeft: number;
  matches: number;
  combos: number;
  specialsFired: number;
}

export type Phase = 'IDLE' | 'SWAPPING' | 'RESOLVING' | 'CLEARING' | 'FALLING' | 'REFILLING' | 'CASCADING' | 'LEVEL_COMPLETE' | 'LEVEL_FAILED';
const busyPhases: Phase[] = ['SWAPPING', 'RESOLVING', 'CLEARING', 'FALLING', 'REFILLING', 'CASCADING'];

const timing = (reduced: boolean) =>
  reduced ? { swap: 90, clear: 120, fallBase: 110, fallRow: 10, shuffle: 220, booster: 120 } : { swap: 160, clear: 230, fallBase: 140, fallRow: 22, shuffle: 420, booster: 260 };
const MAX_EFFECTS = 12;
const MAX_POPS = 6;
const HINT_AFTER_MS = 7000;

const toPieces = (s: JewelState): VPiece[] => s.board.flatMap((row, r) => row.flatMap((j, c) => (j ? [{ id: j.id, kind: j.kind, special: j.special, hp: j.hp, r, c, phase: 'idle' as const }] : [])));
const hudOf = (s: JewelState): Hud => ({
  score: s.score,
  movesLeft: s.movesLeft,
  collected: s.collected.slice(),
  iceLeft: s.iceLeft,
  stonesLeft: s.stonesLeft,
  matches: s.matches,
  combos: s.combos,
  specialsFired: s.specialsFired,
});

interface Options {
  reduced: boolean;
  sparks: React.MutableRefObject<SparkLayer | null>;
  cellPx: React.MutableRefObject<number>;
  /** Called when a power-up was used (the screen spends the charge). */
  onBoosterUsed: (b: Booster) => void;
}

export function useJewelGame(level: LevelDef, seed: number, opts: Options) {
  const [state, setState] = useState(() => {
    const game = createGame(level, seed);
    // Development only (stripped from production builds): browser tests can start from a known board.
    const test = import.meta.env.DEV ? (window as { __jewelsTestBoard?: string[] }).__jewelsTestBoard : undefined;
    return test ? { ...game, board: boardFrom(test, 5000) } : game;
  });
  const stateRef = useRef(state);
  const [pieces, setPieces] = useState<VPiece[]>(() => toPieces(state));
  const piecesRef = useRef(pieces);
  const [ice, setIce] = useState(() => state.ice.map((r) => r.slice()));
  const [hud, setHud] = useState<Hud>(() => hudOf(state));
  const [effects, setEffects] = useState<Effect[]>([]);
  const [pops, setPops] = useState<ScorePop[]>([]);
  const [combo, setCombo] = useState<{ id: number; n: number } | null>(null);
  const [moveMs, setMoveMs] = useState(160);
  const [selected, setSelectedState] = useState<Pos | null>(null);
  const selectedRef = useRef<Pos | null>(null);
  const [armed, setArmedState] = useState<Booster | null>(null);
  const armedRef = useRef<Booster | null>(null);
  const [phase, setPhaseState] = useState<Phase>('IDLE');
  const phaseRef = useRef<Phase>('IDLE');
  const timers = useRef(new Set<number>());
  const alive = useRef(true);
  const hintTimer = useRef(0);
  const nextId = useRef(1);
  const reducedRef = useRef(opts.reduced);
  reducedRef.current = opts.reduced;
  const onBoosterUsed = useRef(opts.onBoosterUsed);
  onBoosterUsed.current = opts.onBoosterUsed;

  const setSelected = (p: Pos | null) => {
    selectedRef.current = p;
    setSelectedState(p);
  };
  const setArmed = (b: Booster | null) => {
    armedRef.current = b;
    setArmedState(b);
  };
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const apply = (next: VPiece[]) => {
    piecesRef.current = next;
    setPieces(next);
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
  };
  const wait = (ms: number) => new Promise<void>((res) => later(res, ms));

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const id of pending) clearTimeout(id);
      pending.clear();
      clearTimeout(hintTimer.current);
    };
  }, []);

  // ---------------------------------------------------------------- hint (one timer, only while idle)
  const clearHint = useCallback(() => {
    clearTimeout(hintTimer.current);
    if (piecesRef.current.some((p) => p.phase === 'hint')) apply(piecesRef.current.map((p) => (p.phase === 'hint' ? { ...p, phase: 'idle' } : p)));
  }, []);
  const armHint = useCallback(() => {
    clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => {
      if (!alive.current || phaseRef.current !== 'IDLE' || armedRef.current) return;
      const pair = findHint(stateRef.current);
      if (!pair) return;
      apply(piecesRef.current.map((p) => (pair.some((q) => q.r === p.r && q.c === p.c) ? { ...p, phase: 'hint' } : p)));
    }, HINT_AFTER_MS);
  }, []);
  useEffect(() => {
    armHint();
  }, [armHint]);

  // ---------------------------------------------------------------- effects
  const addEffects = (list: Omit<Effect, 'id'>[], ms: number) => {
    if (list.length === 0) return;
    const withIds = list.slice(0, MAX_EFFECTS).map((e) => ({ ...e, id: nextId.current++ }));
    setEffects((cur) => [...cur, ...withIds].slice(-MAX_EFFECTS));
    const ids = new Set(withIds.map((e) => e.id));
    later(() => setEffects((cur) => cur.filter((e) => !ids.has(e.id))), ms);
  };
  const addPop = (r: number, c: number, points: number) => {
    if (points <= 0) return;
    const pop = { id: nextId.current++, r, c, points, big: points >= 500 };
    setPops((cur) => [...cur, pop].slice(-MAX_POPS));
    later(() => setPops((cur) => cur.filter((p) => p.id !== pop.id)), 900);
  };
  const burstAt = (cells: { r: number; c: number; kind: number }[], perCell: number) => {
    const layer = opts.sparks.current;
    const px = opts.cellPx.current;
    if (!layer || reducedRef.current || !px) return;
    for (const j of cells) layer.burst((j.c + 0.5) * px, (j.r + 0.5) * px, j.kind >= 0 ? KIND_GLOW[j.kind] : j.kind === -2 ? FX.marble : FX.gold, perCell);
  };

  // ---------------------------------------------------------------- steps
  const play = async (step: Step, t: ReturnType<typeof timing>) => {
    if (step.type === 'swap') {
      const { a, b } = step;
      setMoveMs(t.swap);
      const swapped = (list: VPiece[]) => list.map((p) => (p.r === a.r && p.c === a.c ? { ...p, r: b.r, c: b.c } : p.r === b.r && p.c === b.c ? { ...p, r: a.r, c: a.c } : p));
      apply(swapped(piecesRef.current));
      playJewel('swap');
      await wait(t.swap);
      if (!step.valid) {
        playJewel('invalid');
        apply(swapped(piecesRef.current));
        await wait(t.swap);
      }
      return;
    }
    if (step.type === 'booster') {
      const cells = new Set(step.cells.map((p) => `${p.r}-${p.c}`));
      apply(piecesRef.current.map((p) => (cells.has(`${p.r}-${p.c}`) ? { ...p, phase: 'target' } : p)));
      if (step.target) {
        const tg = step.target;
        if (step.booster === 'lightning') addEffects([{ type: 'boltRow', r: tg.r, c: tg.c }, { type: 'boltCol', r: tg.r, c: tg.c }], 420);
        else if (step.booster === 'olympus') addEffects([{ type: 'divine', r: tg.r, c: tg.c, size: 3 }], 520);
        else addEffects([{ type: 'hammer', r: tg.r, c: tg.c }], 360);
      }
      playJewel(step.booster === 'lightning' ? 'lightning' : step.booster === 'olympus' ? 'divine' : step.booster === 'shuffle' ? 'shuffle' : 'hammer');
      await wait(t.booster);
      return;
    }
    if (step.type === 'clear') {
      setPhase(step.cascade >= 2 ? 'CASCADING' : 'CLEARING');
      const gone = new Set(step.cleared.map((j) => j.id));
      const made = new Map(step.created.map((j) => [j.id, j]));
      const cracked = new Map(step.stonesHit.map((j) => [j.id, j.hp]));
      apply(
        piecesRef.current.map((p) =>
          gone.has(p.id)
            ? { ...p, phase: 'clear' }
            : made.has(p.id)
              ? { ...p, special: made.get(p.id)!.special, kind: made.get(p.id)!.kind, phase: 'pop' }
              : cracked.has(p.id)
                ? { ...p, hp: cracked.get(p.id), phase: 'hit' }
                : p
        )
      );
      setHud((h) => {
        const collected = h.collected.slice();
        for (const j of step.cleared) if (j.kind >= 0) collected[j.kind]++;
        for (const j of step.created) if (j.kind >= 0) collected[j.kind]++;
        const fired = step.activations.length;
        return {
          ...h,
          score: h.score + step.points,
          collected,
          iceLeft: h.iceLeft - step.iceBroken.length,
          stonesLeft: h.stonesLeft - step.cleared.filter((j) => j.kind === -2).length,
          matches: h.matches + step.groups.length,
          combos: h.combos + (step.cascade >= 2 ? 1 : 0) + step.activations.filter((a) => a.special === 'combo').length,
          specialsFired: h.specialsFired + fired,
        };
      });
      if (step.iceBroken.length) setIce((cur) => cur.map((row, r) => row.map((v, c) => v && !step.iceBroken.some((p) => p.r === r && p.c === c))));
      // Lightning along rows / columns, a golden wave for Temples, divine light for Tridents and combos.
      const fx: Omit<Effect, 'id'>[] = [];
      for (const act of step.activations) {
        if (act.special === 'lineH') fx.push({ type: 'boltRow', r: act.r, c: act.c });
        else if (act.special === 'lineV') fx.push({ type: 'boltCol', r: act.r, c: act.c });
        else if (act.special === 'bomb') fx.push({ type: 'wave', r: act.r, c: act.c, size: 1.6 });
        else fx.push({ type: 'divine', r: act.r, c: act.c, size: 3.2 });
      }
      addEffects(fx, 460);
      const perCell = step.cleared.length > 24 ? 1 : step.cleared.length > 10 ? 2 : 4;
      burstAt(step.cleared, perCell);
      if (step.cleared.length) {
        const cr = step.cleared.reduce((s, j) => s + j.r, 0) / step.cleared.length;
        const cc = step.cleared.reduce((s, j) => s + j.c, 0) / step.cleared.length;
        addPop(cr, cc, step.points);
      }
      if (step.stonesHit.length || step.cleared.some((j) => j.kind === -2)) playJewel('stone');
      if (step.activations.some((a) => a.special === 'lineH' || a.special === 'lineV')) playJewel('lightning');
      if (step.activations.some((a) => a.special === 'bomb')) playJewel('blast');
      if (step.activations.some((a) => a.special === 'prism' || a.special === 'combo')) playJewel('divine');
      if (!step.activations.length) playJewel('match', step.cascade);
      if (step.created.length) playJewel('special');
      if (step.cascade >= 2) {
        playJewel('cascade', step.cascade);
        setCombo({ id: nextId.current++, n: step.cascade });
      }
      await wait(t.clear);
      apply(piecesRef.current.filter((p) => !gone.has(p.id)).map((p) => (p.phase === 'pop' || p.phase === 'hit' || p.phase === 'target' ? { ...p, phase: 'idle' } : p)));
      return;
    }
    if (step.type === 'fall') {
      setPhase(step.spawns.length ? 'REFILLING' : 'FALLING');
      const moved = new Map(step.moves.map((m) => [m.id, m.to]));
      const deepest = Math.max(1, ...step.moves.map((m) => m.to.r - m.from.r), ...step.spawns.map((s) => s.r - s.fromRow));
      const ms = t.fallBase + t.fallRow * Math.min(deepest, 9);
      setMoveMs(ms);
      const next = piecesRef.current.map((p) => (moved.has(p.id) ? { ...p, ...moved.get(p.id)!, dropFrom: undefined } : p));
      for (const s of step.spawns) next.push({ id: s.id, kind: s.kind, special: s.special, r: s.r, c: s.c, phase: 'idle', dropFrom: s.fromRow });
      apply(next);
      await wait(ms + 10);
      return;
    }
    if (step.type === 'shuffle') {
      setMoveMs(t.shuffle);
      const where = new Map<number, Pos>();
      step.board.forEach((row, r) => row.forEach((j, c) => j && where.set(j.id, { r, c })));
      apply(piecesRef.current.map((p) => ({ ...p, ...(where.get(p.id) ?? {}) })));
      playJewel('shuffle');
      await wait(t.shuffle);
      return;
    }
    // end
    setPhase(step.status === 'won' ? 'LEVEL_COMPLETE' : 'LEVEL_FAILED');
    playJewel(step.status === 'won' ? 'win' : 'lose');
    if (step.bonus > 0) addPop(stateRef.current.rows / 2 - 0.5, stateRef.current.cols / 2 - 0.5, step.bonus);
    if (step.status === 'won' && opts.sparks.current && !reducedRef.current) {
      const px = opts.cellPx.current;
      const w = stateRef.current.cols * px;
      for (let i = 0; i < 6; i++) later(() => opts.sparks.current?.burst(w * (0.1 + 0.16 * i), stateRef.current.rows * px * 0.45, i % 2 ? FX.gold : FX.divine, 24, 1.7), i * 90);
    }
  };

  /** Plays a result's steps, then re-syncs the view to the logical state (the source of truth). */
  const run = async (next: JewelState, steps: Step[]) => {
    const t = timing(reducedRef.current);
    for (const step of steps) {
      if (!alive.current) return;
      if (step.type !== 'swap' && phaseRef.current === 'SWAPPING') setPhase('RESOLVING');
      await play(step, t);
    }
    if (!alive.current) return;
    stateRef.current = next;
    setState(next);
    apply(toPieces(next));
    setIce(next.ice.map((r) => r.slice()));
    setHud(hudOf(next));
    setPhase(next.status === 'won' ? 'LEVEL_COMPLETE' : next.status === 'lost' ? 'LEVEL_FAILED' : 'IDLE');
    if (next.status === 'playing') armHint();
  };

  const attempt = useCallback(
    async (a: Pos, b: Pos) => {
      if (phaseRef.current !== 'IDLE' || armedRef.current) return;
      clearHint();
      setSelected(null);
      const res = trySwap(stateRef.current, a, b);
      if (!res.ok && res.reason !== 'no_match') {
        if (res.reason === 'blocked') playJewel('invalid');
        return;
      }
      setPhase('SWAPPING');
      if (!res.ok) {
        await play(res.steps[0], timing(reducedRef.current));
        if (!alive.current) return;
        setPhase('IDLE');
        armHint();
        return;
      }
      setHud((h) => ({ ...h, movesLeft: h.movesLeft - 1 }));
      await run(res.state, res.steps);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Uses a power-up now (Divine Shuffle) or at `target`. Returns false if it can't be used there. */
  const fireBooster = useCallback(
    async (b: Booster, target: Pos | null) => {
      if (phaseRef.current !== 'IDLE') return false;
      const res = applyBooster(stateRef.current, b, target);
      if (!res.ok) {
        playJewel('invalid');
        return false;
      }
      clearHint();
      setSelected(null);
      setArmed(null);
      onBoosterUsed.current(b);
      setPhase('RESOLVING');
      await run(res.state, res.steps);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Picks a power-up: Divine Shuffle goes off at once; the others wait for a tap on the board. */
  const arm = useCallback(
    (b: Booster | null) => {
      if (phaseRef.current !== 'IDLE') return;
      playJewel('click');
      if (b && !TARGETED[b]) return void fireBooster(b, null);
      setSelected(null);
      setArmed(armedRef.current === b ? null : b);
    },
    [fireBooster]
  );

  /** Tap: aim the armed power-up, or select a jewel, or swap with the selected one when adjacent. */
  const tap = useCallback(
    (p: Pos) => {
      if (phaseRef.current !== 'IDLE') return;
      armHint();
      if (armedRef.current) return void fireBooster(armedRef.current, p);
      const cur = selectedRef.current;
      if (cur && cur.r === p.r && cur.c === p.c) return setSelected(null);
      if (cur && Math.abs(cur.r - p.r) + Math.abs(cur.c - p.c) === 1) {
        setSelected(null);
        void attempt(cur, p);
        return;
      }
      if (stateRef.current.board[p.r][p.c]?.kind === -2) return void playJewel('invalid');
      playJewel('select');
      setSelected(p);
    },
    [attempt, armHint, fireBooster]
  );

  /** Development tools only: replace the logical state (e.g. more moves) and re-sync the view. */
  const devSetState = useCallback((next: JewelState) => {
    if (!import.meta.env.DEV || phaseRef.current !== 'IDLE') return;
    stateRef.current = next;
    setState(next);
    apply(toPieces(next));
    setIce(next.ice.map((r) => r.slice()));
    setHud(hudOf(next));
  }, []);

  const busy = busyPhases.includes(phase);
  const goals = goalProgress({ ...state, ...hud, goals: state.goals, iceTotal: state.iceTotal, stonesTotal: state.stonesTotal });
  return { state, pieces, ice, hud, effects, pops, combo, moveMs, selected, armed, phase, busy, attempt, tap, arm, fireBooster, devSetState, goals };
}
