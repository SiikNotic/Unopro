// Player preferences. Pure helpers here; persistence and React wiring live in PreferencesProvider.
import type { BotDifficulty } from '@/game/bots/profiles';
import type { ScenarioId } from '@/game/scenarios/scenarios';
import { SCENARIO_IDS } from '@/game/scenarios/scenarios';

export type ScenarioChoice = ScenarioId | 'random';

export interface Preferences {
  sound: boolean;
  /** Background music (only heard while `sound` is also on). */
  music: boolean;
  /** Music volume slider, 0–1. */
  musicVolume: number;
  /** Sound effects volume slider, 0–1. */
  sfxVolume: number;
  haptics: boolean;
  animations: boolean;
  difficulty: BotDifficulty;
  scenario: ScenarioChoice;
}

export const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  music: true,
  musicVolume: 0.35,
  sfxVolume: 0.8,
  haptics: true,
  animations: true,
  difficulty: 'normal',
  scenario: 'random',
};

export const DIFFICULTY_OPTIONS: BotDifficulty[] = ['easy', 'normal', 'hard'];

/** Accepts anything read from storage and returns a valid Preferences object. */
export function normalizePreferences(raw: unknown): Preferences {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (key: keyof Preferences) => (typeof value[key] === 'boolean' ? (value[key] as boolean) : (DEFAULT_PREFERENCES[key] as boolean));
  const difficulty = DIFFICULTY_OPTIONS.includes(value.difficulty as BotDifficulty) ? (value.difficulty as BotDifficulty) : DEFAULT_PREFERENCES.difficulty;
  const scenario =
    value.scenario === 'random' || SCENARIO_IDS.includes(value.scenario as ScenarioId) ? (value.scenario as ScenarioChoice) : DEFAULT_PREFERENCES.scenario;
  const volume = (raw: unknown, fallback: number) =>
    typeof raw === 'number' && Number.isFinite(raw) ? Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100 : fallback;
  const musicVolume = volume(value.musicVolume, DEFAULT_PREFERENCES.musicVolume);
  const sfxVolume = volume(value.sfxVolume, DEFAULT_PREFERENCES.sfxVolume);
  return { sound: bool('sound'), music: bool('music'), musicVolume, sfxVolume, haptics: bool('haptics'), animations: bool('animations'), difficulty, scenario };
}
