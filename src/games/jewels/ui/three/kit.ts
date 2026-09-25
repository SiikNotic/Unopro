// The board's art as GPU textures: the painted gems, special medallions, marble seals and effect sprites from
// the Jewellery: Olympus asset pack (AI-upscaled to HD, see scripts/olympus-assets.py), plus two small
// procedural sprites (a soft glow and a four-point sparkle). Loaded once per board, released with it.
import * as THREE from 'three';
import { FX_IMAGES, GEM_IMAGES, SPECIAL_IMAGES, STONE_IMAGES } from '../assets';

export interface Kit {
  gems: THREE.Texture[];
  lightning: THREE.Texture;
  temple: THREE.Texture;
  trident: THREE.Texture;
  stones: [THREE.Texture, THREE.Texture];
  fx: Record<keyof typeof FX_IMAGES, THREE.Texture>;
  glow: THREE.Texture;
  sparkle: THREE.Texture;
  quad: THREE.PlaneGeometry;
  dispose(): void;
}

function canvasTexture(draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function loadKit(renderer: THREE.WebGLRenderer): Promise<Kit> {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (url: string) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const fxKeys = Object.keys(FX_IMAGES) as (keyof typeof FX_IMAGES)[];
  const [gems, lightning, temple, trident, stones, fxList] = await Promise.all([
    Promise.all(GEM_IMAGES.map(load)),
    load(SPECIAL_IMAGES.lightning),
    load(SPECIAL_IMAGES.temple),
    load(SPECIAL_IMAGES.trident),
    Promise.all(STONE_IMAGES.map(load)),
    Promise.all(fxKeys.map((k) => load(FX_IMAGES[k]))),
  ]);
  const fx = Object.fromEntries(fxKeys.map((k, i) => [k, fxList[i]])) as Kit['fx'];
  const glow = canvasTexture((x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  });
  const sparkle = canvasTexture((x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 20);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(64, 0);
    x.quadraticCurveTo(68, 60, 128, 64);
    x.quadraticCurveTo(68, 68, 64, 128);
    x.quadraticCurveTo(60, 68, 0, 64);
    x.quadraticCurveTo(60, 60, 64, 0);
    x.fill();
  });
  const quad = new THREE.PlaneGeometry(1, 1);
  const all: { dispose(): void }[] = [...gems, lightning, temple, trident, ...stones, ...fxList, glow, sparkle, quad];
  return {
    gems,
    lightning,
    temple,
    trident,
    stones: [stones[0], stones[1]],
    fx,
    glow,
    sparkle,
    quad,
    dispose() {
      for (const d of all) d.dispose();
    },
  };
}
