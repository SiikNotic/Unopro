// The 3D stones as still images for the interface (rendered once per session, on demand, with three.js in
// its own chunk). Until they are ready, or without WebGL, the painted pack images stand in.
import { useEffect, useState } from 'react';
import { GEM_IMAGES } from './assets';
import { canUse3D } from './three/support';

let cached: string[] | null = null;
let pending: Promise<string[] | null> | null = null;

function load(): Promise<string[] | null> {
  pending ??= import('./three/snapshots')
    .then(({ renderGemIcons }) => (cached = renderGemIcons()))
    .catch(() => null);
  return pending;
}

export function useGemIcons(): string[] {
  const [icons, setIcons] = useState<string[] | null>(cached);
  useEffect(() => {
    if (cached || !canUse3D()) return;
    let alive = true;
    void load().then((urls) => alive && urls && setIcons(urls));
    return () => {
      alive = false;
    };
  }, []);
  return icons ?? GEM_IMAGES;
}
