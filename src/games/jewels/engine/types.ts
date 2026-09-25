// Jewellery (single-player match-3): the pure game model. No React, no DOM, no timers — the UI animates
// the steps the engine returns (see resolve.ts).

/** Jewel kinds, by index. Each one has its own silhouette in the UI (not only its colour). */
export const KINDS = ['diamond', 'emerald', 'ruby', 'sapphire', 'amethyst', 'topaz'] as const;
export type KindName = (typeof KINDS)[number];
/** 0–5 (see KINDS); a prism has no kind (PRISM_KIND). */
export type Kind = number;
export const PRISM_KIND = -1;

/**
 * Special jewels: lineH clears its row, lineV its column, bomb the 3×3 around it, prism every jewel of one
 * kind. New specials are added by extending this union, effectArea() and the combo table in resolve.ts.
 */
export type Special = 'lineH' | 'lineV' | 'bomb' | 'prism';

export interface Jewel {
  /** Stable id: the UI keys and animates a jewel by it for its whole life. */
  id: number;
  kind: Kind;
  special: Special | null;
}

export type Board = (Jewel | null)[][];

export interface Pos {
  r: number;
  c: number;
}

export type Goal = { type: 'collect'; kind: Kind; count: number } | { type: 'score'; target: number } | { type: 'ice' };

export type Status = 'playing' | 'won' | 'lost';

export interface JewelState {
  levelId: number;
  rows: number;
  cols: number;
  /** How many kinds this level uses (the first N of KINDS). */
  kinds: number;
  board: Board;
  /** Ice under a cell: it breaks when the jewel on that cell is cleared. Doesn't affect gravity. */
  ice: boolean[][];
  /** PRNG state (mulberry32): the whole game is reproducible from the level and the seed. */
  rng: number;
  nextId: number;
  score: number;
  movesLeft: number;
  movesUsed: number;
  /** Jewels cleared per kind (for collect goals). */
  collected: number[];
  iceLeft: number;
  iceTotal: number;
  goals: Goal[];
  /** Score needed for 1, 2 and 3 stars. */
  starScores: [number, number, number];
  status: Status;
}

export interface ClearedJewel extends Jewel {
  r: number;
  c: number;
}

/** A special going off: where, what, and the cells it hits (the UI draws beams / rings from this). */
export interface Activation {
  r: number;
  c: number;
  special: Special | 'combo';
  cells: Pos[];
}

/** What happened, in order: the UI plays these one after another and the board is idle again after the last. */
export type Step =
  | { type: 'swap'; a: Pos; b: Pos; valid: boolean }
  | {
      type: 'clear';
      /** 1 for the player's move, 2+ for each cascade after it. */
      cascade: number;
      cleared: ClearedJewel[];
      /** Jewels that became specials (same id, new special) and stay on the board. */
      created: ClearedJewel[];
      activations: Activation[];
      iceBroken: Pos[];
      points: number;
    }
  | { type: 'fall'; moves: { id: number; from: Pos; to: Pos }[]; spawns: (ClearedJewel & { fromRow: number })[] }
  | { type: 'shuffle'; board: Board }
  | { type: 'end'; status: Exclude<Status, 'playing'>; bonus: number };

export type SwapResult = { ok: true; state: JewelState; steps: Step[] } | { ok: false; reason: 'not_playing' | 'not_adjacent' | 'empty' | 'no_match'; steps: Step[] };
