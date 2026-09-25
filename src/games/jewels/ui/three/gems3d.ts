// The 3D jewel kit: faceted gem geometries (one silhouette per kind), physically based materials lit by a
// studio environment, gold emblems for the specials, marble seals, and soft glow / sparkle sprites.
// Everything is procedural (no model files) and created once per renderer, shared by every piece.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gemMaterial } from './gemShader';
import type { GemLook } from './gemShader';

type P2 = [number, number];

// ---------------------------------------------------------------------------------------------------------
// Outlines (unit size, y up). Each kind has its own silhouette so it reads without colour:
// 0 round brilliant, 1 emerald (step-cut octagon), 2 heart, 3 pear, 4 trillion, 5 hexagon.

const ring = (n: number, r: number, rot = 0, sx = 1, sy = 1): P2[] => Array.from({ length: n }, (_, i) => [Math.cos(rot + (i / n) * Math.PI * 2) * r * sx, Math.sin(rot + (i / n) * Math.PI * 2) * r * sy]);

function heart(): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x / 17, (y + 2.5) / 17]);
  }
  return pts.reverse();
}

function pear(): P2[] {
  return Array.from({ length: 12 }, (_, i) => {
    const a = Math.PI / 2 + (i / 12) * Math.PI * 2;
    const s = Math.sin(a);
    const r = 0.78 * (1 + 0.55 * Math.max(0, s) ** 4);
    return [Math.cos(a) * r * 0.92, s * r - 0.12] as P2;
  });
}

function trillion(): P2[] {
  // A triangle with softly rounded sides.
  const pts: P2[] = [];
  const corners = ring(3, 1, Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 3];
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      const mx = a[0] + (b[0] - a[0]) * t;
      const my = a[1] + (b[1] - a[1]) * t;
      const bulge = Math.sin(t * Math.PI) * 0.16;
      const len = Math.hypot(mx, my) || 1;
      pts.push([mx + (mx / len) * bulge, my + (my / len) * bulge]);
    }
  }
  return pts.map(([x, y]) => [x * 0.98, y * 0.98 - 0.08]);
}

const OUTLINES: P2[][] = [
  ring(12, 0.96, Math.PI / 12), // round brilliant
  [
    [-0.46, 0.92],
    [0.46, 0.92],
    [0.7, 0.68],
    [0.7, -0.68],
    [0.46, -0.92],
    [-0.46, -0.92],
    [-0.7, -0.68],
    [-0.7, 0.68],
  ], // emerald cut
  heart(),
  pear(),
  trillion(),
  ring(6, 0.98, 0, 1, 0.94), // hexagon
];

interface Cut {
  /** Rings from the girdle up: [scale towards the centre, height]. */
  crown: [number, number][];
  /** Rings from the girdle down, ending in the culet. */
  pavilion: [number, number][];
  /** Alternate rings are twisted half a step (triangular "brilliant" facets) instead of stepped bands. */
  brilliant: boolean;
}

// Few, large facets (clean, readable at any size): a twisted crown ring (kite facets) up to the table, a deep
// pavilion.
const BRILLIANT: Cut = { crown: [[0.58, 0.3]], pavilion: [[0.45, -0.34], [0, -0.62]], brilliant: true };
const CUTS: Cut[] = [
  BRILLIANT,
  { crown: [[0.84, 0.12], [0.64, 0.24]], pavilion: [[0.7, -0.2], [0.36, -0.4], [0, -0.52]], brilliant: false },
  BRILLIANT,
  BRILLIANT,
  { crown: [[0.56, 0.28]], pavilion: [[0.45, -0.32], [0, -0.58]], brilliant: true },
  BRILLIANT,
];

/** Build a faceted solid: girdle outline, crown rings up to the table, pavilion rings down to the culet. */
function cutGeometry(outline: P2[], cut: Cut): THREE.BufferGeometry {
  const n = outline.length;
  const cx = outline.reduce((s, p) => s + p[0], 0) / n;
  const cy = outline.reduce((s, p) => s + p[1], 0) / n;
  const at = (i: number, k: number, z: number, twist: boolean): THREE.Vector3 => {
    let x: number;
    let y: number;
    if (twist) {
      const a = outline[i % n];
      const b = outline[(i + 1) % n];
      x = (a[0] + b[0]) / 2;
      y = (a[1] + b[1]) / 2;
    } else [x, y] = outline[i % n];
    return new THREE.Vector3(cx + (x - cx) * k, cy + (y - cy) * k, z);
  };
  const pos: number[] = [];
  // Barycentric coordinates for the facet edges drawn by the shader; `hide` names vertices whose opposite
  // edges are not real facet edges (a quad's diagonal, the spokes of the table) and so are not drawn.
  const bary: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ...hide: (0 | 1 | 2)[]) => {
    const bc: [number, number, number][] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    for (const h of hide) for (const v of bc) v[h] = 1;
    // Face outwards: away from the gem's centre.
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3).sub(new THREE.Vector3(cx, cy, 0));
    const order = nrm.dot(mid) < 0 ? [0, 2, 1] : [0, 1, 2];
    const vs = [a, b, c];
    for (const i of order) {
      pos.push(vs[i].x, vs[i].y, vs[i].z);
      bary.push(...bc[i]);
    }
  };
  const band = (k0: number, z0: number, t0: boolean, k1: number, z1: number, t1: boolean) => {
    for (let i = 0; i < n; i++) {
      const a0 = at(i, k0, z0, t0);
      const a1 = at(i + 1, k0, z0, t0);
      const b0 = at(i, k1, z1, t1);
      const b1 = at(i + 1, k1, z1, t1);
      if (t0 === t1) {
        // A quad facet split along a0–b1: hide that diagonal.
        tri(a0, a1, b1, 1);
        tri(a0, b1, b0, 2);
      } else if (t1) {
        // Inner ring sits between outer vertices i and i+1.
        tri(a0, a1, b0);
        tri(at(i - 1 + n, k1, z1, true), a0, b0);
      } else {
        tri(b0, b1, a0);
        tri(at(i - 1 + n, k0, z0, true), b0, a0);
      }
    }
  };
  const levels = (rings: [number, number][]) => {
    let prev: [number, number, boolean] = [1, 0, false];
    rings.forEach(([k, z], idx) => {
      const twist = cut.brilliant && idx % 2 === 0;
      if (k === 0) {
        // Apex (culet): a fan.
        const apex = new THREE.Vector3(cx, cy, z);
        for (let i = 0; i < n; i++) tri(at(i, prev[0], prev[1], prev[2]), at(i + 1, prev[0], prev[1], prev[2]), apex);
      } else band(prev[0], prev[1], prev[2], k, z, twist);
      prev = [k, z, twist];
    });
    return prev;
  };
  const top = levels(cut.crown);
  // Table: a flat fan at the top.
  const tableCentre = new THREE.Vector3(cx, cy, top[1]);
  for (let i = 0; i < n; i++) tri(at(i, top[0], top[1], top[2]), at(i + 1, top[0], top[1], top[2]), tableCentre, 0, 1);
  levels(cut.pavilion);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('bary', new THREE.Float32BufferAttribute(bary, 3));
  g.computeVertexNormals();
  g.scale(0.4, 0.4, 0.4);
  return g;
}

// ---------------------------------------------------------------------------------------------------------
// Emblems (gold, extruded): lightning bolt, temple, trident.

function shapeOf(pts: P2[]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
const rect = (x0: number, y0: number, x1: number, y1: number) =>
  shapeOf([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);

const EMBLEMS: Record<'bolt' | 'temple' | 'trident', THREE.Shape[]> = {
  bolt: [
    shapeOf([
      [0.12, 0.52],
      [-0.3, -0.04],
      [-0.03, -0.04],
      [-0.14, -0.52],
      [0.3, 0.08],
      [0.03, 0.08],
    ]),
  ],
  temple: [
    rect(-0.42, -0.46, 0.42, -0.36),
    rect(-0.33, -0.36, -0.23, 0.14),
    rect(-0.05, -0.36, 0.05, 0.14),
    rect(0.23, -0.36, 0.33, 0.14),
    rect(-0.4, 0.14, 0.4, 0.24),
    shapeOf([
      [-0.44, 0.24],
      [0.44, 0.24],
      [0, 0.48],
    ]),
  ],
  trident: [
    rect(-0.045, -0.6, 0.045, 0.08),
    shapeOf([
      [-0.34, 0.08],
      [0.34, 0.08],
      [0.3, 0.17],
      [-0.3, 0.17],
    ]),
    shapeOf([
      [-0.34, 0.17],
      [-0.25, 0.17],
      [-0.25, 0.4],
      [-0.2, 0.4],
      [-0.295, 0.56],
      [-0.39, 0.4],
      [-0.34, 0.4],
    ]),
    shapeOf([
      [-0.045, 0.17],
      [0.045, 0.17],
      [0.045, 0.46],
      [0.1, 0.46],
      [0, 0.64],
      [-0.1, 0.46],
      [-0.045, 0.46],
    ]),
    shapeOf([
      [0.25, 0.17],
      [0.34, 0.17],
      [0.34, 0.4],
      [0.39, 0.4],
      [0.295, 0.56],
      [0.2, 0.4],
      [0.25, 0.4],
    ]),
  ],
};

function emblemGeometry(shapes: THREE.Shape[]): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shapes, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.022, bevelSegments: 2, curveSegments: 4 });
  g.center();
  return g;
}

// ---------------------------------------------------------------------------------------------------------
// Textures drawn on a canvas: marble (with an optional crack), a soft glow and a four-point sparkle.

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function marbleTexture(cracked: boolean): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d')!;
  const bg = x.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#fbf8f1');
  bg.addColorStop(0.6, '#ebe4d6');
  bg.addColorStop(1, '#cfc5b2');
  x.fillStyle = bg;
  x.fillRect(0, 0, size, size);
  const rnd = seeded(cracked ? 77 : 31);
  for (let v = 0; v < 9; v++) {
    x.strokeStyle = `rgba(${120 + rnd() * 40},${110 + rnd() * 30},${95 + rnd() * 30},${0.18 + rnd() * 0.3})`;
    x.lineWidth = 0.6 + rnd() * 2.2;
    x.beginPath();
    let px = rnd() * size;
    let py = 0;
    x.moveTo(px, py);
    while (py < size) {
      px += (rnd() - 0.5) * 60;
      py += 20 + rnd() * 30;
      x.quadraticCurveTo(px + (rnd() - 0.5) * 40, py - 12, px, py);
    }
    x.stroke();
  }
  // Gold inlay line.
  x.strokeStyle = '#c99a3a';
  x.lineWidth = 7;
  x.strokeRect(30, 30, size - 60, size - 60);
  x.strokeStyle = 'rgba(255,241,196,0.8)';
  x.lineWidth = 2;
  x.strokeRect(28, 28, size - 56, size - 56);
  if (cracked) {
    x.strokeStyle = '#3d352a';
    x.lineWidth = 5;
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(128, 8);
    [
      [116, 70],
      [148, 112],
      [104, 150],
      [136, 196],
      [120, 250],
    ].forEach(([a, b]) => x.lineTo(a, b));
    x.moveTo(148, 112);
    x.lineTo(210, 130);
    x.moveTo(116, 70);
    x.lineTo(60, 84);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

function sparkleTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 22);
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
  return new THREE.CanvasTexture(cv);
}

// ---------------------------------------------------------------------------------------------------------
// The reflections: a jeweller's light box. A dark room with small, very bright softboxes (white, warm gold,
// a cool blue) all around, so each facet catches either a light or the dark: that contrast is what makes
// cut stones sparkle. Rendered once into an environment map.

function jewellerStudio() {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: '#232b3f', side: THREE.BackSide }));
  scene.add(room);
  const panel = new THREE.PlaneGeometry(1, 1);
  const lights: [number, number, number, number, number, string, number][] = [
    // x, y, z, width, height, colour, intensity
    [0, 9, 4, 12, 3.5, '#ffffff', 7],
    [-8, 3, 6, 3.5, 9, '#ffffff', 6],
    [8, 2, 6, 3, 10, '#fff1d0', 5],
    [-5, -6, 7, 5, 1.2, '#ffd27a', 5],
    [6, -5, 5, 3, 1.4, '#9cc8ff', 5],
    [0, 0, 12, 3, 3, '#ffffff', 4],
    [-9, 8, -2, 3, 3, '#ffffff', 6],
    [9, 8, -3, 2, 5, '#ffe7b0', 5],
    [0, -9, 2, 8, 1.5, '#ffffff', 3],
    [3, 5, 9, 1.2, 1.2, '#ffffff', 10],
    [-3, 6, 9, 0.8, 2.4, '#ffffff', 10],
  ];
  const mats: THREE.Material[] = [];
  for (const [x, y, z, w, h, color, k] of lights) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide });
    mats.push(m);
    const mesh = new THREE.Mesh(panel, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  }
  return {
    scene,
    dispose() {
      room.geometry.dispose();
      (room.material as THREE.Material).dispose();
      panel.dispose();
      mats.forEach((m) => m.dispose());
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// The kit.

/** Body colour, then the glow colour, of each kind. */
export const GEM_COLORS: [string, string][] = [
  ['#eaf4ff', '#bfe6ff'], // Celestial Diamond
  ['#07a04a', '#5dffa4'], // Divine Emerald
  ['#e0061f', '#ff5d74'], // Ruby of Fire
  ['#1047e6', '#6aa0ff'], // Sapphire of Poseidon
  ['#8a1ff0', '#c98bff'], // Amethyst of Hades
  ['#ffa000', '#ffd05a'], // Golden Topaz
];

/** How each stone refracts: colour, inner glow, index of refraction and fire (dispersion). */
const GEM_LOOKS: GemLook[] = [
  { tint: '#e6f1ff', glow: '#7aa2d6', ior: 2.42, dispersion: 0.11, brightness: 1.1, fresnelBase: 0.14 }, // diamond: all fire
  { tint: '#0fb557', glow: '#0a6b34', ior: 1.58, dispersion: 0.03, brightness: 1.5 },
  { tint: '#ea0a2a', glow: '#7d0616', ior: 1.77, dispersion: 0.04, brightness: 1.6 },
  { tint: '#1d56f5', glow: '#0a2786', ior: 1.77, dispersion: 0.04, brightness: 1.6 },
  { tint: '#8f2cf5', glow: '#440b8a', ior: 1.55, dispersion: 0.04, brightness: 1.6 },
  { tint: '#ffa40a', glow: '#8a4a00', ior: 1.63, dispersion: 0.05, brightness: 1.45 },
];

export type EmblemName = keyof typeof EMBLEMS;

export class GemKit {
  readonly gems: THREE.BufferGeometry[];
  readonly gemMats: THREE.ShaderMaterial[];
  private cubeTarget: THREE.WebGLCubeRenderTarget;
  readonly emblems: Record<EmblemName, THREE.BufferGeometry>;
  readonly gold: THREE.MeshStandardMaterial;
  readonly orb: THREE.BufferGeometry;
  readonly orbMat: THREE.MeshPhysicalMaterial;
  readonly halo: THREE.BufferGeometry;
  readonly stone: THREE.BufferGeometry;
  readonly stoneMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  readonly glowTex: THREE.Texture;
  readonly sparkleTex: THREE.Texture;
  readonly arrow: THREE.BufferGeometry;
  readonly env: THREE.Texture;
  private disposables: { dispose(): void }[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = jewellerStudio();
    this.env = pmrem.fromScene(studio.scene, 0.01).texture;
    // A sharp cube map of the same studio for the stones (refraction wants crisp lights, not blurred ones).
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: false });
    new THREE.CubeCamera(0.1, 50, this.cubeTarget).update(renderer, studio.scene);
    studio.dispose();
    pmrem.dispose();

    this.gems = OUTLINES.map((o, k) => cutGeometry(o, CUTS[k]));
    this.gemMats = GEM_LOOKS.map((look) => gemMaterial(this.cubeTarget.texture, look));
    this.emblems = { bolt: emblemGeometry(EMBLEMS.bolt), temple: emblemGeometry(EMBLEMS.temple), trident: emblemGeometry(EMBLEMS.trident) };
    this.gold = new THREE.MeshStandardMaterial({ color: '#f5c451', metalness: 1, roughness: 0.2, envMap: this.env, envMapIntensity: 1.8, emissive: new THREE.Color('#3a2400') });
    this.orb = new THREE.IcosahedronGeometry(0.3, 1);
    this.orbMat = new THREE.MeshPhysicalMaterial({
      color: '#4f8dff',
      metalness: 0.85,
      roughness: 0.03,
      flatShading: true,
      iridescence: 1,
      iridescenceIOR: 2.2,
      clearcoat: 1,
      envMap: this.env,
      envMapIntensity: 3,
      emissive: new THREE.Color('#15306e'),
    });
    this.halo = new THREE.TorusGeometry(0.36, 0.035, 10, 48);
    this.stone = new RoundedBoxGeometry(0.84, 0.84, 0.3, 4, 0.08);
    const marble = (cracked: boolean) => new THREE.MeshStandardMaterial({ map: marbleTexture(cracked), roughness: 0.35, metalness: 0, envMap: this.env, envMapIntensity: 0.9 });
    this.stoneMats = [marble(true), marble(false)];
    this.glowTex = glowTexture();
    this.sparkleTex = sparkleTexture();
    this.arrow = new THREE.ConeGeometry(0.07, 0.14, 3);
    this.disposables.push(this.cubeTarget, ...this.gems, ...this.gemMats, ...Object.values(this.emblems), this.gold, this.orb, this.orbMat, this.halo, this.stone, this.glowTex, this.sparkleTex, this.arrow, this.env);
    for (const m of this.stoneMats) this.disposables.push(m, m.map!);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

/** Lights shared by the board and the icon renders: the studio environment does most of the work. */
export function addLights(scene: THREE.Scene) {
  // Flat-shaded facets each take a different share of these, so the cut reads even without reflections.
  scene.add(new THREE.AmbientLight('#ffffff', 0.12));
  const key = new THREE.DirectionalLight('#fff4dc', 3.2);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffe2b0', 1.2);
  fill.position.set(5, 2, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#9cc4ff', 1.6);
  rim.position.set(3, -5, 2);
  scene.add(rim);
}
