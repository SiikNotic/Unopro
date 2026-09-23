// Scenario catalogue: pure data (names, table palette). The animated layers live in SceneBackground.

export const SCENARIO_IDS = ['sky', 'volcano', 'ocean', 'space', 'forest', 'city', 'lounge'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioPalette {
  felt: string;
  feltLight: string;
  feltDeep: string;
  rimLight: string;
  rim: string;
  rimDeep: string;
  inlay: string;
  /** Ambient light tint that falls on the table. */
  light: string;
}

export interface Scenario {
  id: ScenarioId;
  nameKey: string;
  palette: ScenarioPalette;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  sky: {
    id: 'sky',
    nameKey: 'scenarios.sky',
    palette: { felt: '#1f5f93', feltLight: '#3a86c2', feltDeep: '#0c2f52', rimLight: '#f4f1ea', rim: '#cfc8b8', rimDeep: '#8d8574', inlay: '#e8c979', light: 'rgba(255, 236, 200, 0.16)' },
  },
  volcano: {
    id: 'volcano',
    nameKey: 'scenarios.volcano',
    palette: { felt: '#3b1d18', feltLight: '#6a2c1d', feltDeep: '#150907', rimLight: '#4a4440', rim: '#2b2623', rimDeep: '#0e0c0b', inlay: '#ff7a2f', light: 'rgba(255, 110, 40, 0.18)' },
  },
  ocean: {
    id: 'ocean',
    nameKey: 'scenarios.ocean',
    palette: { felt: '#0f6068', feltLight: '#1b8a92', feltDeep: '#052f36', rimLight: '#9a7148', rim: '#6b4a2c', rimDeep: '#2d1c0e', inlay: '#bfe8ef', light: 'rgba(170, 235, 255, 0.14)' },
  },
  space: {
    id: 'space',
    nameKey: 'scenarios.space',
    palette: { felt: '#2a2268', feltLight: '#4a3ea3', feltDeep: '#0f0b2e', rimLight: '#6c7392', rim: '#373c55', rimDeep: '#12141f', inlay: '#7de2f5', light: 'rgba(140, 170, 255, 0.14)' },
  },
  forest: {
    id: 'forest',
    nameKey: 'scenarios.forest',
    palette: { felt: '#2c5a2f', feltLight: '#46803f', feltDeep: '#10280f', rimLight: '#6b4b2a', rim: '#3e2a17', rimDeep: '#1a0f06', inlay: '#e2c56a', light: 'rgba(255, 230, 150, 0.14)' },
  },
  city: {
    id: 'city',
    nameKey: 'scenarios.city',
    palette: { felt: '#48183a', feltLight: '#72285c', feltDeep: '#1c0717', rimLight: '#3a3a44', rim: '#1d1d24', rimDeep: '#08080b', inlay: '#ff5fb7', light: 'rgba(255, 95, 183, 0.12)' },
  },
  lounge: {
    id: 'lounge',
    nameKey: 'scenarios.lounge',
    palette: { felt: '#0f5a52', feltLight: '#187266', feltDeep: '#062f2c', rimLight: '#5a3722', rim: '#3b2416', rimDeep: '#1c0f08', inlay: '#c9a24a', light: 'rgba(255, 214, 150, 0.1)' },
  },
};

/**
 * Picks the scenario for a new game. A fixed choice is honoured; "random" avoids repeating the last one.
 * `rand` is injectable for tests (visual choice only — it never touches the engine).
 */
export function pickScenario(choice: ScenarioId | 'random', last: ScenarioId | null, rand: () => number = Math.random): ScenarioId {
  if (choice !== 'random') return choice;
  const pool = SCENARIO_IDS.filter((id) => id !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** CSS custom properties that tint the table for a scenario. */
export function scenarioStyle(id: ScenarioId): Record<string, string> {
  const p = SCENARIOS[id].palette;
  return {
    '--felt': p.felt,
    '--felt-light': p.feltLight,
    '--felt-deep': p.feltDeep,
    '--rim-light': p.rimLight,
    '--walnut': p.rim,
    '--walnut-deep': p.rimDeep,
    '--brass': p.inlay,
    '--scene-light': p.light,
  };
}
