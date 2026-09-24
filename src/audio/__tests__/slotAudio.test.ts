import { beforeEach, describe, expect, it, vi } from 'vitest';

const played: string[] = [];
const stops: number[] = [];
vi.mock('../sfx', () => ({
  withAudio: (fn: (c: unknown, bus: unknown, noise: unknown, t: number) => void) => {
    played.push('x');
    void fn;
    return true;
  },
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
    expect(slotSound('lucky7s', 'click', 1000)).toBe(true);
    expect(slotSound('inferno', 'click', 1010)).toBe(false);
    expect(slotSound('lucky7s', 'click', 1100)).toBe(true);
    expect(played).toHaveLength(2);
  });

  it('lets five staggered reel stops through but not a burst', () => {
    [0, 200, 400, 600, 800].forEach((t) => slotSound('cosmic', 'reelStop', t));
    expect(played).toHaveLength(5);
    [900, 905, 910].forEach((t) => slotSound('cosmic', 'reelStop', t));
    expect(played).toHaveLength(6);
  });

  it('never stacks two win fanfares', () => {
    slotSound('royal', 'mega', 0);
    expect(slotSound('royal', 'small', 100)).toBe(false);
    expect(slotSound('royal', 'big', 100)).toBe(false);
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

describe('machine sound profiles', async () => {
  const { PROFILES } = await import('../machineSounds');
  const { MACHINE_IDS } = await import('@/casino/premium/engine');
  it('every machine has its own voice for every event', () => {
    const events = ['click', 'spin', 'reelStop', 'anticipation', 'coin', 'small', 'big', 'mega', 'jackpot', 'feature', 'reveal', 'error'] as const;
    for (const id of MACHINE_IDS) for (const e of events) expect(typeof PROFILES[id][e]).toBe('function');
    // Distinct voices: no two machines share the same reel-stop or win sound.
    expect(new Set(MACHINE_IDS.map((id) => PROFILES[id].reelStop)).size).toBe(8);
    expect(new Set(MACHINE_IDS.map((id) => PROFILES[id].big)).size).toBe(8);
  });
});
