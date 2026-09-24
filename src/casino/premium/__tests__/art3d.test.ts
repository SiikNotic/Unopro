import { describe, expect, it } from 'vitest';
import { MACHINE_IDS } from '../engine';
import { MACHINES } from '../machines';

const FILES = Object.keys(import.meta.glob('../../../components/slots/art/*/*.webp'));

describe('3D art', () => {
  it('every machine has a render for each symbol plus its logo, SPIN button and frame', () => {
    const missing: string[] = [];
    for (const id of MACHINE_IDS) {
      for (const name of [...Object.keys(MACHINES[id].symbols), 'logo', 'spin', 'frame']) {
        if (!FILES.includes(`../../../components/slots/art/${id}/${name}.webp`)) missing.push(`${id}/${name}`);
      }
    }
    expect(FILES.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
