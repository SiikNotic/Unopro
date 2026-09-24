import { beforeEach, describe, expect, it, vi } from 'vitest';

const played: string[] = [];
const stops: number[] = [];
vi.mock('../sfx', () => ({
  playSfx: (n: string) => played.push(n),
  startLoop: () => {
    const id = stops.length;
    stops.push(0);
    return () => stops[id]++;
  },
}));

const { slotSound, startReelLoop, stopReelLoop, resetSlotAudio } = await import('../slotAudio');

describe('slot audio', () => {
  beforeEach(() => {
    played.length = 0;
    stops.length = 0;
    resetSlotAudio();
  });

  it('dedupes the same sound fired twice in a row', () => {
    expect(slotSound('click', 1000)).toBe(true);
    expect(slotSound('click', 1010)).toBe(false);
    expect(slotSound('click', 1100)).toBe(true);
    expect(played).toEqual(['spinClick', 'spinClick']);
  });

  it('lets five staggered reel stops through but not a burst', () => {
    [0, 200, 400, 600, 800].forEach((t) => slotSound('reelStop', t));
    expect(played).toHaveLength(5);
    [900, 905, 910].forEach((t) => slotSound('reelStop', t));
    expect(played).toHaveLength(6);
  });

  it('never stacks two win fanfares', () => {
    slotSound('mega', 0);
    expect(slotSound('small', 100)).toBe(false);
    expect(slotSound('big', 100)).toBe(false);
  });

  it('the reel loop cannot run twice and stops once', () => {
    startReelLoop();
    startReelLoop();
    expect(stops).toHaveLength(1);
    stopReelLoop();
    stopReelLoop();
    expect(stops[0]).toBe(1);
  });
});
