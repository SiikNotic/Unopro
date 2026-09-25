// Plays a Jewellery level: holds the logical state (engine) and the visual state (jewels on screen, effects),
// and plays each move's steps one after another. Event-driven: nothing runs between moves except an
// optional hint timer; every timeout is tracked and cleared on unmount.
//
//   IDLE → SWAPPING → (CLEARING → COLLAPSING/REFILLING)* → IDLE        (input is ignored while busy)
import { useCallback, useEffect, useRef, useState } from 'react';
import { boardFrom, createGame, goalProgress, hint as findHint, trySwap } from '../engine';
import type { JewelState, LevelDef, Pos, Special, Step } from '../engine';
import type { JewelPhase } from './Jewel';
import { KIND_GLOW } from './palette';
import { playJewel } from './jewelAudio';
import type { SparkLayer } from './particles';

export interface VPiece {
  id: number;
  kind: number;
  special: Special | null;
  r: number;
  c: number;
  phase: JewelPhase;
  dropFrom?: number;
}

export interface Effect {
  id: number;
  type: 'row' | 'col' | 'ring' | 'flash';
  r: number;
  c: number;
  /** Ring radius in cells. */
  size?: number;
}

export interface Hud {
  score: number;
  movesLeft: number;
  collected: number[];
  iceLeft: number;
}

export type Machine = 'idle' | 'swapping' | 'resolving' | 'ended';

const timing = (reduced: boolean) => (reduced ? { swap: 90, clear: 110, fallBase: 110, fallRow: 10, shuffle: 200 } : { swap: 150, clear: 170, fallBase: 130, fallRow: 20, shuffle: 380 });
const MAX_EFFECTS = 14;
const HINT_AFTER_MS = 7000;

const toPieces = (s: JewelState): VPiece[] => s.board.flatMap((row, r) => row.flatMap((j, c) => (j ? [{ id: j.id, kind: j.kind, special: j.special, r, c, phase: 'idle' as const }] : [])));
const hudOf = (s: JewelState): Hud => ({ score: s.score, movesLeft: s.movesLeft, collected: s.collected.slice(), iceLeft: s.iceLeft });

export function useJewelGame(level: LevelDef, seed: number, opts: { reduced: boolean; sparks: React.MutableRefObject<SparkLayer | null>; cellPx: React.MutableRefObject<number> }) {
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
  const [combo, setCombo] = useState<{ id: number; n: number } | null>(null);
  const [moveMs, setMoveMs] = useState(150);
  const [selected, setSelectedState] = useState<Pos | null>(null);
  const selectedRef = useRef<Pos | null>(null);
  const setSelected = (p: Pos | null) => {
    selectedRef.current = p;
    setSelectedState(p);
  };
  const [machine, setMachine] = useState<Machine>('idle');
  const machineRef = useRef<Machine>('idle');
  const timers = useRef(new Set<number>());
  const alive = useRef(true);
  const hintTimer = useRef(0);
  const effectId = useRef(1);
  const reducedRef = useRef(opts.reduced);
  reducedRef.current = opts.reduced;

  const setM = (m: Machine) => {
    machineRef.current = m;
    setMachine(m);
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
      if (!alive.current || machineRef.current !== 'idle') return;
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
    const withIds = list.slice(0, MAX_EFFECTS).map((e) => ({ ...e, id: effectId.current++ }));
    setEffects((cur) => [...cur, ...withIds].slice(-MAX_EFFECTS));
    const ids = new Set(withIds.map((e) => e.id));
    later(() => setEffects((cur) => cur.filter((e) => !ids.has(e.id))), ms);
  };

  const burstAt = (cells: { r: number; c: number; kind: number }[], perCell: number) => {
    const layer = opts.sparks.current;
    const px = opts.cellPx.current;
    if (!layer || reducedRef.current || !px) return;
    for (const j of cells) layer.burst((j.c + 0.5) * px, (j.r + 0.5) * px, KIND_GLOW[j.kind] ?? '#fff', perCell);
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
    if (step.type === 'clear') {
      const gone = new Set(step.cleared.map((j) => j.id));
      const made = new Map(step.created.map((j) => [j.id, j]));
      apply(piecesRef.current.map((p) => (gone.has(p.id) ? { ...p, phase: 'clear' } : made.has(p.id) ? { ...p, special: made.get(p.id)!.special, kind: made.get(p.id)!.kind, phase: 'pop' } : p)));
      setHud((h) => {
        const collected = h.collected.slice();
        for (const j of step.cleared) if (j.kind >= 0) collected[j.kind]++;
        return { ...h, score: h.score + step.points, collected, iceLeft: h.iceLeft - step.iceBroken.length };
      });
      if (step.iceBroken.length) setIce((cur) => cur.map((row, r) => row.map((v, c) => v && !step.iceBroken.some((p) => p.r === r && p.c === c))));
      // Effects: beams for lines, rings for bombs and combos. Sparks are capped by the layer.
      const fx: Omit<Effect, 'id'>[] = [];
      for (const act of step.activations) {
        if (act.special === 'lineH') fx.push({ type: 'row', r: act.r, c: act.c });
        else if (act.special === 'lineV') fx.push({ type: 'col', r: act.r, c: act.c });
        else if (act.special === 'bomb') fx.push({ type: 'ring', r: act.r, c: act.c, size: 1.5 });
        else fx.push({ type: 'flash', r: act.r, c: act.c, size: 3 });
      }
      addEffects(fx, 360);
      const perCell = step.cleared.length > 24 ? 1 : step.cleared.length > 10 ? 2 : 4;
      burstAt(step.cleared, perCell);
      if (step.activations.length) playJewel('blast');
      else playJewel('match', step.cascade);
      if (step.created.length) playJewel('special');
      if (step.cascade >= 2) {
        playJewel('cascade', step.cascade);
        setCombo({ id: effectId.current++, n: step.cascade });
      }
      await wait(t.clear);
      apply(piecesRef.current.filter((p) => !gone.has(p.id)).map((p) => (p.phase === 'pop' ? { ...p, phase: 'idle' } : p)));
      return;
    }
    if (step.type === 'fall') {
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
      await wait(t.shuffle);
      return;
    }
    // end
    playJewel(step.status === 'won' ? 'win' : 'lose');
    if (step.status === 'won' && opts.sparks.current && !reducedRef.current) {
      const px = opts.cellPx.current;
      const w = stateRef.current.cols * px;
      for (let i = 0; i < 5; i++) later(() => opts.sparks.current?.burst(w * (0.15 + 0.175 * i), stateRef.current.rows * px * 0.4, KIND_GLOW[i % 6], 22, 1.6), i * 90);
    }
  };

  const attempt = useCallback(
    async (a: Pos, b: Pos) => {
      if (machineRef.current !== 'idle') return;
      clearHint();
      setSelected(null);
      const res = trySwap(stateRef.current, a, b);
      if (!res.ok && res.reason !== 'no_match') return;
      const t = timing(reducedRef.current);
      setM('swapping');
      if (!res.ok) {
        await play(res.steps[0], t);
        if (!alive.current) return;
        setM('idle');
        armHint();
        return;
      }
      setHud((h) => ({ ...h, movesLeft: h.movesLeft - 1 }));
      for (const step of res.steps) {
        if (!alive.current) return;
        if (step.type !== 'swap' && (machineRef.current as Machine) === 'swapping') setM('resolving');
        await play(step, t);
      }
      if (!alive.current) return;
      // The logical state is the source of truth: re-sync the view to it after every move.
      stateRef.current = res.state;
      setState(res.state);
      apply(toPieces(res.state));
      setIce(res.state.ice.map((r) => r.slice()));
      setHud(hudOf(res.state));
      setM(res.state.status === 'playing' ? 'idle' : 'ended');
      if (res.state.status === 'playing') armHint();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Tap: select a jewel, or swap with the selected one when adjacent. */
  const tap = useCallback(
    (p: Pos) => {
      if (machineRef.current !== 'idle') return;
      armHint();
      const cur = selectedRef.current;
      if (cur && cur.r === p.r && cur.c === p.c) return setSelected(null);
      if (cur && Math.abs(cur.r - p.r) + Math.abs(cur.c - p.c) === 1) {
        setSelected(null);
        void attempt(cur, p);
        return;
      }
      playJewel('select');
      setSelected(p);
    },
    [attempt, armHint]
  );

  return { state, pieces, ice, hud, effects, combo, moveMs, selected, machine, attempt, tap, goals: goalProgress({ ...state, ...hud, goals: state.goals, iceTotal: state.iceTotal }) };
}
