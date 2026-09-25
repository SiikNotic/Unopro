// The 3D Olympus backdrop as an image for the current screen size: rendered once per size (three.js in its
// own chunk, after the first paint), again only when the size really changes (debounced). Without WebGL it
// stays null and the vector scene is shown.
import { useEffect, useState } from 'react';
import { canUse3D } from './three/support';

const cache = new Map<string, string>();

function screenKey() {
  // Round so tiny changes (a browser bar sliding) don't trigger a new render.
  const w = Math.round(window.innerWidth / 40) * 40;
  const h = Math.round(window.innerHeight / 60) * 60;
  return { w, h, key: `${w}x${h}` };
}

export function useBackdrop(): string | null {
  const [url, setUrl] = useState<string | null>(() => cache.get(screenKey().key) ?? null);
  useEffect(() => {
    if (!canUse3D()) return;
    let alive = true;
    let timer = 0;
    const render = () => {
      const { w, h, key } = screenKey();
      const hit = cache.get(key);
      if (hit) return setUrl(hit);
      void import('./three/backdrop3d').then(({ renderBackdrop }) => {
        if (!alive) return;
        const out = renderBackdrop({ width: w, height: h, dpr: Math.min(window.devicePixelRatio || 1, 2) });
        if (!out) return;
        cache.set(key, out);
        setUrl(out);
      });
    };
    // After the first paint: the screen is usable while the backdrop renders.
    timer = window.setTimeout(render, 60);
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(render, 300);
    };
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return url;
}
