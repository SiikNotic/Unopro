// Development tools for Jewellery: Olympus. Loaded only when import.meta.env.DEV (the dynamic import is
// removed from production builds, so none of this ships). Everything goes through the engine's own state.
import { useState } from 'react';
import { createRng } from '@/games/shared/rng';
import { goalProgress, reshuffle } from '../engine';
import type { JewelState, Pos, Special } from '../engine';

interface DevToolsProps {
  state: JewelState;
  selected: Pos | null;
  phase: string;
  onSet: (s: JewelState) => void;
  onLevel: (delta: number) => void;
}

const cloneBoard = (s: JewelState) => s.board.map((row) => row.map((j) => (j ? { ...j } : null)));

export default function JewelDevTools({ state, selected, phase, onSet, onLevel }: DevToolsProps) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="ol-dev-toggle" onClick={() => setOpen(true)}>
        DEV
      </button>
    );
  const special = (sp: Special) => {
    const p = selected ?? { r: Math.floor(state.rows / 2), c: Math.floor(state.cols / 2) };
    const board = cloneBoard(state);
    const j = board[p.r][p.c];
    if (!j || j.kind === -2) return;
    board[p.r][p.c] = { ...j, special: sp, kind: sp === 'prism' ? -1 : Math.max(0, j.kind) };
    onSet({ ...state, board });
  };
  const goalsDone = () => {
    const next = { ...state, collected: state.collected.slice() };
    for (const g of state.goals) {
      if (g.type === 'collect') next.collected[g.kind] = Math.max(next.collected[g.kind], g.count);
      if (g.type === 'score') next.score = Math.max(next.score, g.target);
      if (g.type === 'matches') next.matches = Math.max(next.matches, g.count);
      if (g.type === 'combos') next.combos = Math.max(next.combos, g.count);
      if (g.type === 'specials') next.specialsFired = Math.max(next.specialsFired, g.count);
      if (g.type === 'ice') {
        next.ice = state.ice.map((row) => row.map(() => false));
        next.iceLeft = 0;
      }
    }
    onSet(next);
  };
  /** A ready five: row 0 gets four of a kind around a gap, the jewel below the gap matches (swap it up). */
  const readyFive = () => {
    const board = cloneBoard(state);
    const k = 0;
    for (const c of [0, 1, 3, 4]) if (board[0][c] && board[0][c]!.kind !== -2) board[0][c] = { ...board[0][c]!, kind: k, special: null };
    if (board[1][2] && board[1][2]!.kind !== -2) board[1][2] = { ...board[1][2]!, kind: k, special: null };
    onSet({ ...state, board });
  };
  return (
    <div className="ol-dev" role="region" aria-label="Developer tools">
      <div className="ol-dev-row">
        <b>DEV</b>
        <span>
          L{state.levelId} · seed {state.seed} · {phase}
        </span>
        <button type="button" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div className="ol-dev-row">
        <button type="button" onClick={() => onLevel(-1)}>
          ◀ L
        </button>
        <button type="button" onClick={() => onLevel(1)}>
          L ▶
        </button>
        <button type="button" onClick={() => onSet({ ...state, movesLeft: state.movesLeft + 5 })}>
          +5 mov
        </button>
        <button type="button" onClick={() => onSet({ ...state, board: reshuffle(state.board, createRng(Date.now() >>> 0)) })}>
          reset board
        </button>
      </div>
      <div className="ol-dev-row">
        <button type="button" onClick={() => special('lineH')}>
          rayo
        </button>
        <button type="button" onClick={() => special('bomb')}>
          templo
        </button>
        <button type="button" onClick={() => special('prism')}>
          tridente
        </button>
        <button type="button" onClick={readyFive}>
          match 5 / cascada
        </button>
        <button type="button" onClick={goalsDone}>
          objetivos ✓ (gana al mover)
        </button>
      </div>
      <p className="ol-dev-note">{goalProgress(state).map((g) => `${g.goal.type} ${g.current}/${g.target}`).join(' · ')}</p>
    </div>
  );
}
