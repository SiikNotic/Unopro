// Jewellery: Olympus (single-player match-3): the pure game model. No React, no DOM, no timers — the UI
// animates the steps the engine returns (see resolve.ts).

/**
 * Jewel kinds, by index: Celestial Diamond, Divine Emerald, Ruby of Fire, Sapphire of Poseidon, Amethyst of
 * Hades, Golden Topaz. Each has its own silhouette in the UI (not only its colour).
 */
export const KINDS = ['diamond', 'emerald', 'ruby', 'sapphire', 'amethyst', 'topaz'] as const;
export type KindName = (typeof KINDS)[number];
/** 0–5 (see KINDS). Negative kinds never match: a prism has PRISM_KIND, a marble seal STONE_KIND. */
export type Kind = number;
export const PRISM_KIND = -1;
export const STONE_KIND = -2;

/**
 * Special jewels (engine names → Olympus names):
 *   lineH / lineV — Lightning Gem (4 in a line): lightning runs along its row / column.
 *   bomb          — Temple of Olympus (T or L): a shockwave over the 3×3 around it.
 *   prism         — Divine Trident (5 in a line): every jewel of one kind.
 * New specials: extend this union, effectArea() and the combo table in resolve.ts, and the art in the UI.
 */
export type Special = 'lineH' | 'lineV' | 'bomb' | 'prism';

export interface Jewel {
  /** Stable id: the UI keys and animates a piece by it for its whole life. */
  id: number;
  kind: Kind;
  special: Special | null;
  /** Marble seals only: hits left (1–2). */
  hp?: number;
}

export type Board = (Jewel | null)[][];

export interface Pos {
  r: number;
  c: number;
}

export type Goal =
  | { type: 'collect'; kind: Kind; count: number }
  | { type: 'score'; target: number }
  | { type: 'ice' }
  | { type: 'stone' }
  | { type: 'matches'; count: number }
  | { type: 'combos'; count: number }
  | { type: 'specials'; count: number };

export type Status = 'playing' | 'won' | 'lost';

/** Power-ups: they don't use a move. */
export type Booster = 'hammer' | 'shuffle' | 'lightning' | 'olympus';
export const BOOSTERS: Booster[] = ['hammer', 'shuffle', 'lightning', 'olympus'];
/** Boosters that need a target cell. */
export const TARGETED: Record<Booster, boolean> = { hammer: true, shuffle: false, lightning: true, olympus: true };

export interface JewelState {
  levelId: number;
  rows: number;
  cols: number;
  /** How many kinds this level uses (the first N of KINDS). */
  kinds: number;
  /** Specials this level can create. */
  specials: Special[];
  board: Board;
  /** Crystal under a cell: it breaks when the jewel on that cell is cleared. Doesn't affect gravity. */
  ice: boolean[][];
  /** PRNG state (mulberry32): the whole game is reproducible from the level and the seed. */
  rng: number;
  seed: number;
  nextId: number;
  score: number;
  movesLeft: number;
  movesUsed: number;
  /** Jewels cleared per kind (for collect goals). */
  collected: number[];
  iceLeft: number;
  iceTotal: number;
  stonesLeft: number;
  stonesTotal: number;
  /** Matches made (a T or an L counts once). */
  matches: number;
  /** Cascade links (a clear after the first of a move) and special + special combos. */
  combos: number;
  /** Specials that went off. */
  specialsFired: number;
  goals: Goal[];
  /** Score needed for 1, 2 and 3 stars. */
  starScores: [number, number, number];
  status: Status;
}

export interface ClearedJewel extends Jewel {
  r: number;
  c: number;
}

/** A special going off: where, what, and the cells it hits (the UI draws lightning / waves from this). */
export interface Activation {
  r: number;
  c: number;
  special: Special | 'combo';
  cells: Pos[];
}

/** What happened, in order: the UI plays these one after another and the board is idle again after the last. */
export type Step =
  | { type: 'swap'; a: Pos; b: Pos; valid: boolean }
  | { type: 'booster'; booster: Booster; target: Pos | null; cells: Pos[] }
  | {
      type: 'clear';
      /** 1 for the move itself, 2+ for each cascade after it. */
      cascade: number;
      cleared: ClearedJewel[];
      /** Jewels that became specials (same id, new special) and stay on the board. */
      created: ClearedJewel[];
      activations: Activation[];
      iceBroken: Pos[];
      /** Marble seals that cracked and stay (with the hits they have left). */
      stonesHit: ClearedJewel[];
      /** Matches in this clear (for the "match 3 / 4 / 5" feedback). */
      groups: { size: number; shape: 'line' | 'corner' }[];
      points: number;
    }
  | { type: 'fall'; moves: { id: number; from: Pos; to: Pos }[]; spawns: (ClearedJewel & { fromRow: number })[] }
  | { type: 'shuffle'; board: Board }
  | { type: 'end'; status: Exclude<Status, 'playing'>; bonus: number };

export type SwapResult =
  | { ok: true; state: JewelState; steps: Step[] }
  | { ok: false; reason: 'not_playing' | 'not_adjacent' | 'empty' | 'blocked' | 'no_match'; steps: Step[] };

export type BoosterResult = { ok: true; state: JewelState; steps: Step[] } | { ok: false; reason: 'not_playing' | 'bad_target' };
