// One board piece in 3D: a gem (or a Divine Trident orb, or a marble seal) with its glow, its sparkle and,
// for specials, a gold emblem. Built from the shared GemKit, so building one only creates small objects.
import * as THREE from 'three';
import type { Special } from '../../engine';
import { STONE_KIND } from '../../engine';
import { GEM_COLORS } from './gems3d';
import type { GemKit } from './gems3d';

export interface Piece3D {
  root: THREE.Group;
  /** Rotates / scales (the idle shimmer and the phase animations). */
  body: THREE.Group;
  glow: THREE.Sprite;
  sparkle: THREE.Sprite | null;
  /** Spinning parts (the trident's halo). */
  spin: THREE.Object3D | null;
  special: Special | null;
  stone: boolean;
  /** Owned materials to dispose with the piece (sprites clone theirs to animate opacity). */
  owned: THREE.Material[];
}

const SPECIAL_GLOW: Partial<Record<Special, string>> = { lineH: '#bfe3ff', lineV: '#bfe3ff', bomb: '#ffd77a', prism: '#fff4d2' };

export function buildPiece(kit: GemKit, kind: number, special: Special | null, hp?: number): Piece3D {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const owned: THREE.Material[] = [];
  const stone = kind === STONE_KIND;
  let spin: THREE.Object3D | null = null;

  const glowColor = special ? SPECIAL_GLOW[special]! : stone ? '#000000' : GEM_COLORS[kind]?.[1] ?? '#ffffff';
  const glowMat = new THREE.SpriteMaterial({ map: kit.glowTex, color: glowColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: stone ? 0 : special ? 0.75 : 0.38 });
  owned.push(glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(special ? 1.35 : 1.05);
  glow.position.z = -0.6;
  root.add(glow);

  if (stone) {
    const m = new THREE.Mesh(kit.stone, kit.stoneMats[hp === 1 ? 0 : 1]);
    body.add(m);
  } else if (special === 'prism') {
    const orb = new THREE.Mesh(kit.orb, kit.orbMat);
    orb.scale.setScalar(1.15);
    body.add(orb);
    const halo = new THREE.Mesh(kit.halo, kit.gold);
    halo.scale.setScalar(1.05);
    body.add(halo);
    spin = halo;
    const trident = new THREE.Mesh(kit.emblems.trident, kit.gold);
    trident.scale.setScalar(0.62);
    trident.position.z = 0.34;
    body.add(trident);
  } else {
    const gem = new THREE.Mesh(kit.gems[kind] ?? kit.gems[0], kit.gemMats[kind] ?? kit.gemMats[0]);
    body.add(gem);
    if (special === 'lineH' || special === 'lineV') {
      const bolt = new THREE.Mesh(kit.emblems.bolt, kit.gold);
      bolt.scale.setScalar(0.5);
      bolt.position.z = 0.16;
      body.add(bolt);
      const horizontal = special === 'lineH';
      for (const side of [-1, 1]) {
        const a = new THREE.Mesh(kit.arrow, kit.gold);
        a.position.set(horizontal ? side * 0.4 : 0, horizontal ? 0 : side * 0.4, 0.12);
        a.rotation.z = horizontal ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? 0 : Math.PI;
        body.add(a);
      }
    } else if (special === 'bomb') {
      const temple = new THREE.Mesh(kit.emblems.temple, kit.gold);
      temple.scale.setScalar(0.46);
      temple.position.z = 0.16;
      body.add(temple);
    }
  }

  let sparkle: THREE.Sprite | null = null;
  if (!stone) {
    const sm = new THREE.SpriteMaterial({ map: kit.sparkleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    owned.push(sm);
    sparkle = new THREE.Sprite(sm);
    sparkle.scale.setScalar(0.42);
    sparkle.position.set(-0.14, 0.16, 0.5);
    root.add(sparkle);
  }
  return { root, body, glow, sparkle, spin, special, stone, owned };
}

export function disposePiece(p: Piece3D) {
  for (const m of p.owned) m.dispose();
  p.root.removeFromParent();
}
