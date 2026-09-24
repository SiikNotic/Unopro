import type { MachineId } from '@/casino/premium/engine';

/**
 * Pre-rendered 3D art (real geometry + PBR materials, rendered offline to transparent WebP):
 * one image per symbol, plus each machine's logo, SPIN button and reel frame. Only URLs are
 * bundled here; the browser fetches an image the first time it is shown. Anything missing falls
 * back to the vector art.
 */
const FILES = import.meta.glob('./art/*/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const art3d = (machine: MachineId, name: string): string | undefined => FILES[`./art/${machine}/${name}.webp`];

export interface MachineArt {
  logo?: string;
  spin?: string;
  frame?: string;
}

export const machineArt = (machine: MachineId): MachineArt => ({
  logo: art3d(machine, 'logo'),
  spin: art3d(machine, 'spin'),
  frame: art3d(machine, 'frame'),
});
