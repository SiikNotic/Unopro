import { describe, expect, it } from 'vitest';
import { musicGain, pickTrack, TRACKS } from '../music';

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

describe('playlist', () => {
  it('has both tracks and starts on a random one', () => {
    expect(TRACKS).toEqual(['audio/midnight-spins.mp3', 'audio/late-night-spins.mp3']);
    expect(pickTrack(null, () => 0)).toBe(0);
    expect(pickTrack(null, () => 0.99)).toBe(1);
  });
  it('never repeats the track that just played', () => {
    for (const r of [0, 0.3, 0.7, 0.999]) {
      expect(pickTrack(0, () => r)).toBe(1);
      expect(pickTrack(1, () => r)).toBe(0);
    }
  });
});
