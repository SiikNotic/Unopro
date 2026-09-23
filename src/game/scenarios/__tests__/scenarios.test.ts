import { describe, expect, it } from 'vitest';
import { SCENARIO_IDS, SCENARIOS, pickScenario, scenarioStyle } from '../scenarios';

describe('Scenarios', () => {
  it('has the six requested scenarios plus the lounge', () => {
    for (const id of ['sky', 'volcano', 'ocean', 'space', 'forest', 'city'] as const) expect(SCENARIO_IDS).toContain(id);
    for (const id of SCENARIO_IDS) {
      expect(SCENARIOS[id].id).toBe(id);
      expect(SCENARIOS[id].nameKey).toBe(`scenarios.${id}`);
    }
  });

  it('honours a fixed choice', () => {
    expect(pickScenario('volcano', 'volcano', () => 0.5)).toBe('volcano');
  });

  it('random never repeats the previous scenario and covers every other one', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const pick = pickScenario('random', 'space', () => i / 100);
      expect(pick).not.toBe('space');
      seen.add(pick);
    }
    expect(seen.size).toBe(SCENARIO_IDS.length - 1);
    expect(SCENARIO_IDS).toContain(pickScenario('random', null, () => 0.999999));
  });

  it('exposes table colors as CSS variables', () => {
    const style = scenarioStyle('ocean');
    expect(style['--felt']).toBe(SCENARIOS.ocean.palette.felt);
    expect(Object.keys(style)).toEqual(expect.arrayContaining(['--felt', '--walnut', '--brass', '--scene-light']));
  });
});
