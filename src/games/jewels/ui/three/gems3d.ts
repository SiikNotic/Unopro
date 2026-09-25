// The 3D jewel kit: faceted gem geometries (one silhouette per kind), physically based materials lit by a
// studio environment, gold emblems for the specials, marble seals, and soft glow / sparkle sprites.
// Everything is procedural (no model files) and created once per renderer, shared by every piece.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type P2 = [number, number];

// ---------------------------------------------------------------------------------------------------------
// Outlines (unit size, y up). Each kind has its own silhouette so it reads without colour:
// 0 round brilliant, 1 emerald (step-cut octagon), 2 heart, 3 pear, 4 trillion, 5 hexagon.

const ring = (n: number, r: number, rot = 0, sx = 1, sy = 1): P2[] => Array.from({ length: n }, (_, i) => [Math.cos(rot + (i / n) * Math.PI * 2) * r * sx, Math.sin(rot + (i / n) * Math.PI * 2) * r * sy]);

function heart(): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x / 17, (y + 2.5) / 17]);
  }
  return pts.reverse();
}

function pear(): P2[] {
  return Array.from({ length: 24 }, (_, i) => {
    const a = Math.PI / 2 + (i / 24) * Math.PI * 2;
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
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
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
  ring(16, 0.96, Math.PI / 16), // round brilliant
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

const CUTS: Cut[] = [
  { crown: [[0.8, 0.13], [0.56, 0.24]], pavilion: [[0.55, -0.34], [0, -0.62]], brilliant: true },
  { crown: [[0.86, 0.09], [0.72, 0.17], [0.6, 0.22]], pavilion: [[0.7, -0.18], [0.42, -0.36], [0, -0.5]], brilliant: false },
  { crown: [[0.78, 0.14], [0.55, 0.24]], pavilion: [[0.5, -0.34], [0, -0.58]], brilliant: true },
  { crown: [[0.78, 0.14], [0.54, 0.24]], pavilion: [[0.5, -0.32], [0, -0.58]], brilliant: true },
  { crown: [[0.76, 0.14], [0.5, 0.23]], pavilion: [[0.5, -0.3], [0, -0.52]], brilliant: true },
  { crown: [[0.8, 0.12], [0.58, 0.22]], pavilion: [[0.52, -0.32], [0, -0.56]], brilliant: true },
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
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    // Face outwards: away from the gem's centre.
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3).sub(new THREE.Vector3(cx, cy, 0));
    if (nrm.dot(mid) < 0) pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const band = (k0: number, z0: number, t0: boolean, k1: number, z1: number, t1: boolean) => {
    for (let i = 0; i < n; i++) {
      const a0 = at(i, k0, z0, t0);
      const a1 = at(i + 1, k0, z0, t0);
      const b0 = at(i, k1, z1, t1);
      const b1 = at(i + 1, k1, z1, t1);
      if (t0 === t1) {
        tri(a0, a1, b1);
        tri(a0, b1, b0);
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
  for (let i = 0; i < n; i++) tri(at(i, top[0], top[1], top[2]), at(i + 1, top[0], top[1], top[2]), tableCentre);
  levels(cut.pavilion);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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
// The kit.

/** Body colour, then the glow colour, of each kind. */
export const GEM_COLORS: [string, string][] = [
  ['#eef7ff', '#bfe6ff'], // Celestial Diamond
  ['#10a653', '#5dffa4'], // Divine Emerald
  ['#d8102c', '#ff5d74'], // Ruby of Fire
  ['#1a55e8', '#6aa0ff'], // Sapphire of Poseidon
  ['#8f34ea', '#c98bff'], // Amethyst of Hades
  ['#ffa914', '#ffd05a'], // Golden Topaz
];

export type EmblemName = keyof typeof EMBLEMS;

export class GemKit {
  readonly gems: THREE.BufferGeometry[];
  readonly gemMats: THREE.MeshPhysicalMaterial[];
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
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.02).texture;
    room.dispose();
    pmrem.dispose();

    this.gems = OUTLINES.map((o, k) => cutGeometry(o, CUTS[k]));
    this.gemMats = GEM_COLORS.map(([body], k) => {
      const diamond = k === 0;
      return new THREE.MeshPhysicalMaterial({
        color: body,
        metalness: diamond ? 0.15 : 0.3,
        roughness: 0.04,
        flatShading: true,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        iridescence: diamond ? 1 : 0.35,
        iridescenceIOR: 1.9,
        iridescenceThicknessRange: [200, 900],
        emissive: new THREE.Color(body).multiplyScalar(diamond ? 0.06 : 0.22),
        envMap: this.env,
        envMapIntensity: diamond ? 3.2 : 2.3,
        specularIntensity: 1,
        specularColor: new THREE.Color('#ffffff'),
      });
    });
    this.emblems = { bolt: emblemGeometry(EMBLEMS.bolt), temple: emblemGeometry(EMBLEMS.temple), trident: emblemGeometry(EMBLEMS.trident) };
    this.gold = new THREE.MeshStandardMaterial({ color: '#f5c451', metalness: 1, roughness: 0.2, envMap: this.env, envMapIntensity: 1.8, emissive: new THREE.Color('#3a2400') });
    this.orb = new THREE.IcosahedronGeometry(0.3, 1);
    this.orbMat = new THREE.MeshPhysicalMaterial({
      color: '#bfe3ff',
      metalness: 0.2,
      roughness: 0.03,
      flatShading: true,
      iridescence: 1,
      iridescenceIOR: 2.2,
      clearcoat: 1,
      envMap: this.env,
      envMapIntensity: 3,
      emissive: new THREE.Color('#1a3b7a'),
    });
    this.halo = new THREE.TorusGeometry(0.36, 0.035, 10, 48);
    this.stone = new RoundedBoxGeometry(0.84, 0.84, 0.3, 4, 0.08);
    const marble = (cracked: boolean) => new THREE.MeshStandardMaterial({ map: marbleTexture(cracked), roughness: 0.35, metalness: 0, envMap: this.env, envMapIntensity: 0.9 });
    this.stoneMats = [marble(true), marble(false)];
    this.glowTex = glowTexture();
    this.sparkleTex = sparkleTexture();
    this.arrow = new THREE.ConeGeometry(0.07, 0.14, 3);
    this.disposables.push(...this.gems, ...this.gemMats, ...Object.values(this.emblems), this.gold, this.orb, this.orbMat, this.halo, this.stone, this.glowTex, this.sparkleTex, this.arrow, this.env);
    for (const m of this.stoneMats) this.disposables.push(m, m.map!);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

/** Lights shared by the board and the icon renders: the studio environment does most of the work. */
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight('#ffffff', 0.35));
  const key = new THREE.DirectionalLight('#fff4dc', 2.2);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9cc4ff', 1.2);
  rim.position.set(4, -2, 3);
  scene.add(rim);
}
