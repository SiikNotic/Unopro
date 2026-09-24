import { describe, expect, it } from 'vitest';
import { musicGain } from '../music';

describe('music volume', () => {
  it('maps the slider gently and caps it well below full volume', () => {
    expect(musicGain(0)).toBe(0);
    expect(musicGain(1)).toBe(0.55);
    expect(musicGain(0.5)).toBe(0.138);
    expect(musicGain(0.35)).toBeLessThan(0.08);
    expect(musicGain(2)).toBe(0.55);
    expect(musicGain(-1)).toBe(0);
  });
});
