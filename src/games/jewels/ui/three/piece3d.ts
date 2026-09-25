// One board piece: the painted gem (or the Divine Trident, or a marble seal) on a quad with the sweeping-shine
// material, its soft glow, a twinkle and, for Lightning Gems and Temples, the special's gold medallion on
// top. Built from the shared Kit: building one only creates a few small objects.
import * as THREE from 'three';
import type { Special } from '../../engine';
import { STONE_KIND } from '../../engine';
import { KIND_GLOW } from '../palette';
import type { Kit } from './kit';
import { spriteMaterial } from './spriteMaterial';
import type { SpriteMat } from './spriteMaterial';

export interface Piece3D {
  root: THREE.Group;
  /** Scales / tilts (the phase animations and the idle bob). */
  body: THREE.Group;
  /** Materials whose shine / flash / opacity are animated. */
  mats: SpriteMat[];
  glow: THREE.Sprite;
  sparkle: THREE.Sprite | null;
  /** The medallion of a special, pulsing gently. */
  badge: THREE.Object3D | null;
  /** Spinning ring behind the trident. */
  spin: THREE.Object3D | null;
  special: Special | null;
  stone: boolean;
  owned: THREE.Material[];
}

const SPECIAL_GLOW: Partial<Record<Special, string>> = { lineH: '#bfe3ff', lineV: '#bfe3ff', bomb: '#ffd77a', prism: '#8fc4ff' };

function quad(kit: Kit, map: THREE.Texture, size: number, owned: THREE.Material[], mats: SpriteMat[]) {
  const m = spriteMaterial(map);
  owned.push(m);
  mats.push(m);
  const mesh = new THREE.Mesh(kit.quad, m);
  mesh.scale.set(size, size, 1);
  return mesh;
}

export function buildPiece(kit: Kit, kind: number, special: Special | null, hp?: number): Piece3D {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const owned: THREE.Material[] = [];
  const mats: SpriteMat[] = [];
  const stone = kind === STONE_KIND;
  let badge: THREE.Object3D | null = null;
  let spin: THREE.Object3D | null = null;

  const glowColor = special ? SPECIAL_GLOW[special]! : stone ? '#000000' : KIND_GLOW[kind] ?? '#ffffff';
  const glowMat = new THREE.SpriteMaterial({ map: kit.glow, color: glowColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  owned.push(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(special ? 1.5 : 1.15);
  glow.position.z = -0.1;
  root.add(glow);

  if (stone) {
    body.add(quad(kit, kit.stones[hp === 1 ? 0 : 1], 0.94, owned, mats));
  } else if (special === 'prism') {
    const ringMat = new THREE.MeshBasicMaterial({ map: kit.fx.portal, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
    owned.push(ringMat);
    const ring = new THREE.Mesh(kit.quad, ringMat);
    ring.scale.setScalar(1.12);
    ring.position.z = -0.05;
    body.add(ring);
    spin = ring;
    body.add(quad(kit, kit.trident, 0.92, owned, mats));
  } else {
    body.add(quad(kit, kit.gems[kind] ?? kit.gems[0], 0.9, owned, mats));
    if (special === 'lineH' || special === 'lineV' || special === 'bomb') {
      const b = quad(kit, special === 'bomb' ? kit.temple : kit.lightning, 0.56, owned, mats);
      b.position.set(0, 0, 0.05);
      if (special === 'lineH') b.rotation.z = -Math.PI / 2;
      body.add(b);
      badge = b;
    }
  }

  let sparkle: THREE.Sprite | null = null;
  if (!stone) {
    const sm = new THREE.SpriteMaterial({ map: kit.sparkle, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    owned.push(sm);
    sparkle = new THREE.Sprite(sm);
    sparkle.scale.setScalar(0.4);
    sparkle.position.set(-0.16, 0.18, 0.2);
    root.add(sparkle);
  }
  return { root, body, mats, glow, sparkle, badge, spin, special, stone, owned };
}

export function disposePiece(p: Piece3D) {
  for (const m of p.owned) m.dispose();
  p.root.removeFromParent();
}
