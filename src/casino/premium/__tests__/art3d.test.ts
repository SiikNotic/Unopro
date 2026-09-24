import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MACHINE_IDS } from '../engine';
import { MACHINES } from '../machines';

const ART = resolve(__dirname, '../../../components/slots/art');

describe('3D art', () => {
  it('every machine has a render for each symbol plus its logo, SPIN button and frame', () => {
    const missing: string[] = [];
    for (const id of MACHINE_IDS) {
      for (const name of [...Object.keys(MACHINES[id].symbols), 'logo', 'spin', 'frame']) {
        if (!existsSync(resolve(ART, id, `${name}.webp`))) missing.push(`${id}/${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
