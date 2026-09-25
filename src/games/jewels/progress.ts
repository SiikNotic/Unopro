// Jewellery progress: saved with the app's storage (validated on every read — storage can be edited).
// Behind a small interface so a future account sync can replace the local store without touching the game.
import { storage } from '@/storage';
import { LEVELS } from './engine/levels';

export interface LevelRecord {
  score: number;
  stars: number;
}

export interface JewelProgress {
  /** Highest level that can be played. */
  unlocked: number;
  /** Level "Play" continues from. */
  current: number;
  best: Record<number, LevelRecord>;
}

export const EMPTY_PROGRESS: JewelProgress = { unlocked: 1, current: 1, best: {} };
const KEY = 'games.jewels.progress';
const MAX = LEVELS.length;
const clampLevel = (n: unknown, fallback: number) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX ? (n as number) : fallback);

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
  return { unlocked, current: Math.min(clampLevel(r.current, 1), unlocked), best };
}

export interface ProgressStore {
  load(): JewelProgress;
  save(p: JewelProgress): void;
}

export const localProgress: ProgressStore = {
  load: () => normalizeProgress(storage.get(KEY)),
  save: (p) => storage.set(KEY, p),
};

/** Progress after finishing a level (pure). Winning unlocks the next one and moves "Play" to it. */
export function recordResult(p: JewelProgress, levelId: number, won: boolean, score: number, stars: number): JewelProgress {
  if (!won) return { ...p, current: levelId };
  const prev = p.best[levelId];
  const best = { ...p.best, [levelId]: { score: Math.max(prev?.score ?? 0, score), stars: Math.max(prev?.stars ?? 0, stars) } };
  const next = Math.min(MAX, levelId + 1);
  return { unlocked: Math.max(p.unlocked, next), current: next, best };
}
