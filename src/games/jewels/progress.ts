// Jewellery: Olympus progress: unlocked levels, stars, best scores and power-up charges. Saved with the
// app's storage (validated on every read — storage can be edited) behind a small interface, so a future
// account sync can replace the local store without touching the game.
//
// Power-up charges are a game item, not money: they are never bought, never become account coins and
// never leave this game. The account coins stay on the server (src/account).
import { storage } from '@/storage';
import { LEVELS } from './engine/levels';
import { BOOSTERS } from './engine/types';
import type { Booster } from './engine/types';

export interface LevelRecord {
  score: number;
  stars: number;
}

export type Inventory = Record<Booster, number>;

export interface JewelProgress {
  /** Highest level that can be played. */
  unlocked: number;
  /** Level "Play" continues from. */
  current: number;
  best: Record<number, LevelRecord>;
  boosters: Inventory;
}

/** Charges a new player starts with, and the most a player can hold of each. */
export const STARTING_BOOSTERS: Inventory = { hammer: 3, shuffle: 2, lightning: 2, olympus: 1 };
export const MAX_BOOSTERS = 9;

export const EMPTY_PROGRESS: JewelProgress = { unlocked: 1, current: 1, best: {}, boosters: { ...STARTING_BOOSTERS } };
// A new key for Olympus: the earlier Jewellery levels were different, so their progress doesn't carry over.
const KEY = 'games.jewels.olympus';
const MAX = LEVELS.length;
const clampLevel = (n: unknown, fallback: number) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX ? (n as number) : fallback);
const clampCharges = (n: unknown, fallback: number) => (Number.isInteger(n) ? Math.min(MAX_BOOSTERS, Math.max(0, n as number)) : fallback);

export function normalizeProgress(raw: unknown): JewelProgress {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const unlocked = clampLevel(r.unlocked, 1);
  const best: Record<number, LevelRecord> = {};
  if (r.best && typeof r.best === 'object')
    for (const [k, v] of Object.entries(r.best as Record<string, unknown>)) {
      const id = Number(k);
      const rec = v as Record<string, unknown> | null;
      if (!Number.isInteger(id) || id < 1 || id > MAX || !rec) continue;
      const score = Number.isInteger(rec.score) && (rec.score as number) >= 0 ? (rec.score as number) : 0;
      const stars = Number.isInteger(rec.stars) ? Math.min(3, Math.max(0, rec.stars as number)) : 0;
      best[id] = { score, stars };
    }
  const inv = (r.boosters && typeof r.boosters === 'object' ? r.boosters : null) as Record<string, unknown> | null;
  const boosters = Object.fromEntries(BOOSTERS.map((b) => [b, clampCharges(inv?.[b], inv ? 0 : STARTING_BOOSTERS[b])])) as Inventory;
  return { unlocked, current: Math.min(clampLevel(r.current, 1), unlocked), best, boosters };
}

export interface ProgressStore {
  load(): JewelProgress;
  save(p: JewelProgress): void;
}

export const localProgress: ProgressStore = {
  load: () => normalizeProgress(storage.get(KEY)),
  save: (p) => storage.set(KEY, p),
};

export interface LevelOutcome {
  progress: JewelProgress;
  /** The power-up charge earned (only the first time a level is won). */
  reward: Booster | null;
}

/** Progress after finishing a level (pure). Winning unlocks the next one; the first win earns its reward. */
export function recordResult(p: JewelProgress, levelId: number, won: boolean, score: number, stars: number): LevelOutcome {
  if (!won) return { progress: { ...p, current: levelId }, reward: null };
  const prev = p.best[levelId];
  const best = { ...p.best, [levelId]: { score: Math.max(prev?.score ?? 0, score), stars: Math.max(prev?.stars ?? 0, stars) } };
  const next = Math.min(MAX, levelId + 1);
  const reward = prev ? null : (LEVELS.find((l) => l.id === levelId)?.reward ?? null);
  const boosters = { ...p.boosters };
  if (reward) boosters[reward] = Math.min(MAX_BOOSTERS, boosters[reward] + 1);
  return { progress: { unlocked: Math.max(p.unlocked, next), current: next, best, boosters }, reward };
}

/** One charge used (pure; unchanged when there is none left). */
export function spendBooster(p: JewelProgress, b: Booster): JewelProgress {
  if (p.boosters[b] <= 0) return p;
  return { ...p, boosters: { ...p.boosters, [b]: p.boosters[b] - 1 } };
}
