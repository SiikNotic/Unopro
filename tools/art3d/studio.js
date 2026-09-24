// 3D asset studio: builds each slot asset as real geometry with PBR materials and renders it to a
// transparent PNG. Driven by Playwright (window.render(spec) -> dataURL).
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
// Photo-studio environment: dark room with softboxes, so metals and gems read with real contrast.
function studioEnv(front = true) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.MeshBasicMaterial({ color: 0x221e28, side: THREE.BackSide }));
  scene.add(room);
  const box = (w, h, x, y, z, c, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  box(90, 40, 0, 80, 20, 0xffffff, 6); // top softbox
  box(20, 110, -80, 10, 30, 0xfff2dc, 4); // key strip left
  box(16, 110, 80, 0, 10, 0xd8e8ff, 3); // rim strip right
  if (front) {
    box(200, 60, 0, 40, 88, 0xfff6e8, 2.6); // front fill (upper)
    box(200, 34, 0, 0, 90, 0xffffff, 1.7); // front fill (centre band)
    box(200, 50, 0, -38, 88, 0xffd9a8, 1.2); // front fill (lower, warm)
  } else {
    box(70, 14, 0, 60, 70, 0xffffff, 5); // a single high strip: one crisp highlight on domes
  }
  box(80, 16, 0, -40, 85, 0xffffff, 1.4); // low front strip
  box(120, 30, 0, -80, 0, 0x6a4a2a, 1.2); // warm floor bounce
  box(40, 40, 30, 40, -85, 0xffffff, 2.5); // back kicker
  return pmrem.fromScene(scene, 0.02).texture;
}
const envTex = studioEnv();
const envDome = studioEnv(false);

const fonts = {};
const ttf = new TTFLoader();
async function font(name) {
  if (!fonts[name]) fonts[name] = new Font(await ttf.loadAsync(`./fonts/${name}.ttf`));
  return fonts[name];
}

// ---------------------------------------------------------------- materials
const C = (c) => new THREE.Color(c);
const M = {
  gold: (tint = '#f4c451', rough = 0.2) => new THREE.MeshPhysicalMaterial({ color: C(tint), metalness: 1, roughness: Math.max(rough, 0.28), clearcoat: 0.4, clearcoatRoughness: 0.1, envMapIntensity: 1.6 }),
  roseGold: () => new THREE.MeshPhysicalMaterial({ color: C('#e8b99a'), metalness: 1, roughness: 0.2, envMapIntensity: 1.5 }),
  chrome: (tint = '#eef1f5', rough = 0.08) => new THREE.MeshPhysicalMaterial({ color: C(tint), metalness: 1, roughness: rough, envMapIntensity: 1.8 }),
  brass: () => new THREE.MeshPhysicalMaterial({ color: C('#b8863b'), metalness: 0.95, roughness: 0.38, envMapIntensity: 1.3 }),
  lacquer: (c, rough = 0.22) => new THREE.MeshPhysicalMaterial({ color: C(c), metalness: 0.05, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }),
  candy: (c) => new THREE.MeshPhysicalMaterial({ color: C(c), metalness: 0, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0.4, envMapIntensity: 1.1 }),
  gem: (c) => new THREE.MeshPhysicalMaterial({ color: C(c), metalness: 0.85, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.45, iridescenceIOR: 1.8, envMapIntensity: 3.4, flatShading: true, emissive: C(c), emissiveIntensity: 0.3 }),
  // emissive is capped: past ~1 ACES pushes every hue to cream, so saturation comes from the colour itself
  glow: (c, i = 1) => new THREE.MeshStandardMaterial({ color: C(c).multiplyScalar(0.12), emissive: C(c), emissiveIntensity: Math.min(i, 1) * 0.85, roughness: 0.4, metalness: 0, envMapIntensity: 0.15 }),
  obsidian: () => new THREE.MeshPhysicalMaterial({ color: C('#1c0f0c'), metalness: 0.3, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.9 }),
  enamel: () => new THREE.MeshPhysicalMaterial({ color: C('#0c0c10'), metalness: 0.1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 }),
  wood: (c = '#5a3a1e') => new THREE.MeshPhysicalMaterial({ color: C(c), metalness: 0, roughness: 0.62, envMapIntensity: 0.7 }),
  plastic: (c) => new THREE.MeshPhysicalMaterial({ color: C(c), metalness: 0, roughness: 0.35, clearcoat: 0.6, envMapIntensity: 1 }),
  white: () => new THREE.MeshPhysicalMaterial({ color: C('#ffffff'), metalness: 0, roughness: 0.25, clearcoat: 1, envMapIntensity: 1 }),
  stone: (c = '#d8cfbf') => new THREE.MeshPhysicalMaterial({ color: C(c), metalness: 0, roughness: 0.7, envMapIntensity: 0.8 }),
};

// ---------------------------------------------------------------- geometry helpers
const bevel = (depth, size, seg = 4) => ({ depth, bevelEnabled: true, bevelThickness: size, bevelSize: size, bevelSegments: seg, curveSegments: 24 });

function center(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}

/** Filled SVG shapes (our hand-drawn glyphs), extruded and layered in paint order. */
function extrudeSvgFill(svg, pick) {
  const data = new SVGLoader().parse(svg);
  const g = new THREE.Group();
  let z = 0;
  data.paths.forEach((path, i) => {
    const style = path.userData.style;
    const fill = style.fill;
    if (fill && fill !== 'none') {
      const shapes = SVGLoader.createShapes(path);
      if (shapes.length) {
        const geo = new THREE.ExtrudeGeometry(shapes, bevel(4, 1.2, 3));
        const mesh = new THREE.Mesh(geo, pick(fill, i, 'fill'));
        mesh.position.z = z;
        g.add(mesh);
        z += 2.2;
      }
    }
    if (style.stroke && style.stroke !== 'none' && style.strokeWidth > 0) {
      for (const sp of path.subPaths) {
        const tube = tubeFrom(sp.getPoints(24), Math.max(1.4, style.strokeWidth * 0.9));
        if (tube) {
          const mesh = new THREE.Mesh(tube, pick(style.stroke, i, 'stroke'));
          mesh.position.z = z + 2;
          g.add(mesh);
        }
      }
      z += 1;
    }
  });
  g.scale.y = -1;
  return g;
}

function tubeFrom(points, radius) {
  const pts = points.map((p) => new THREE.Vector3(p.x, p.y, 0)).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 0.01);
  if (pts.length < 2) return null;
  const path = new THREE.CurvePath();
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
  const geo = new THREE.TubeGeometry(path, Math.max(8, pts.length * 3), radius, 14, false);
  return geo;
}

/** Stroke icons (lucide, 24x24, stroke 2): every stroke becomes a rounded tube with ball caps. */
function tubeSvgStroke(svg, mat, radius = 1.05) {
  const data = new SVGLoader().parse(svg);
  const g = new THREE.Group();
  for (const path of data.paths) {
    for (const sp of path.subPaths) {
      const pts = sp.getPoints(28);
      const tube = tubeFrom(pts, radius);
      if (!tube) continue;
      g.add(new THREE.Mesh(tube, mat));
      const cap = new THREE.SphereGeometry(radius, 16, 12);
      for (const p of [pts[0], pts[pts.length - 1]]) {
        const s = new THREE.Mesh(cap, mat);
        s.position.set(p.x, p.y, 0);
        g.add(s);
      }
    }
  }
  g.scale.y = -1;
  return g;
}

async function text3d(str, fontName, size, depth, mat, bev = size * 0.05) {
  // mat may be [face, side]: a bright face over a darker metal side reads as a cast title
  const geo = new TextGeometry(str, { font: await font(fontName), size, depth, curveSegments: 10, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 4 });
  geo.computeBoundingBox();
  geo.center();
  return new THREE.Mesh(geo, mat);
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function polygon(n, r, rot = 0) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}
function star(n, r1, r2) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

// ---------------------------------------------------------------- hand-built models
/** Brilliant cut (crown + pavilion) around the Y axis, then turned to face the camera. */
function brilliant(mat, { seg = 16, sx = 1, sy = 1 } = {}) {
  const prof = [new THREE.Vector2(0, -22), new THREE.Vector2(20, 2), new THREE.Vector2(20, 4), new THREE.Vector2(12, 11), new THREE.Vector2(0.01, 11)];
  const geo = new THREE.LatheGeometry(prof, seg);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = 0.35;
  m.scale.set(sx, 1, sy);
  return m;
}
function stepCut(mat) {
  const g = new THREE.ExtrudeGeometry(polygon(8, 20, Math.PI / 8), { depth: 6, bevelEnabled: true, bevelThickness: 5, bevelSize: 6, bevelSegments: 2 });
  const m = new THREE.Mesh(g, mat);
  m.scale.set(0.8, 1.05, 1);
  return m;
}
function coinModel(face, rim) {
  const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(26, 0), new THREE.Vector2(28, 1.5), new THREE.Vector2(28, 5), new THREE.Vector2(26, 6.5), new THREE.Vector2(23, 6.5), new THREE.Vector2(22, 4.5), new THREE.Vector2(0.01, 4.5)];
  const geo = new THREE.LatheGeometry(prof, 64);
  const m = new THREE.Mesh(geo, rim);
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(22.6, 22.6, 1, 64), rim);
  disc.rotation.x = Math.PI / 2;
  disc.position.z = 4;
  g.add(disc);
  if (face) {
    face.position.z = 4.5;
    g.add(face);
  }
  return g;
}
function bellModel(mat) {
  const prof = [new THREE.Vector2(0.01, 26), new THREE.Vector2(6, 25), new THREE.Vector2(10, 20), new THREE.Vector2(12, 8), new THREE.Vector2(15, -6), new THREE.Vector2(22, -14), new THREE.Vector2(23, -17), new THREE.Vector2(20, -17), new THREE.Vector2(0.01, -15)];
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mat));
  const clap = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), mat);
  clap.position.y = -20;
  g.add(clap);
  const knob = new THREE.Mesh(new THREE.TorusGeometry(4, 1.6, 12, 24), mat);
  knob.position.y = 29;
  g.add(knob);
  g.rotation.x = 0.15;
  return g;
}
function cherryModel() {
  const red = M.lacquer('#d10a2a', 0.12);
  const green = M.lacquer('#2f8a2a', 0.3);
  const g = new THREE.Group();
  for (const [x, y] of [[-11, -10], [11, -14]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(12, 40, 30), red);
    b.position.set(x, y, 0);
    g.add(b);
  }
  const stem = (x, y) => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y + 10, 0), new THREE.Vector3(x * 0.2, 22, 2), new THREE.Vector3(2, 28, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.4, 10), green));
  };
  stem(-11, -10);
  stem(11, -14);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), green);
  leaf.scale.set(1.3, 0.45, 0.2);
  leaf.position.set(10, 28, 0);
  leaf.rotation.z = 0.4;
  g.add(leaf);
  return g;
}
function lemonModel(c = '#f7cf1c') {
  const m = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 32), M.lacquer(c, 0.35));
  m.scale.set(1.25, 0.9, 0.9);
  const g = new THREE.Group();
  g.add(m);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), M.lacquer(c, 0.35));
    tip.position.x = s * 25;
    tip.scale.set(1.2, 0.8, 0.8);
    g.add(tip);
  }
  g.rotation.z = 0.35;
  return g;
}
function grapeModel(c = '#6b2bb5') {
  const mat = M.lacquer(c, 0.18);
  const g = new THREE.Group();
  const rows = [4, 3, 3, 2, 1];
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(7.5, 28, 20), mat);
      b.position.set((i - (n - 1) / 2) * 13, 16 - r * 11, (r % 2) * 3);
      g.add(b);
    }
  });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 12, 12), M.lacquer('#4d7a1f', 0.4));
  stem.position.y = 26;
  g.add(stem);
  return g;
}
function bananaModel() {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-24, 14, 0), new THREE.Vector3(-4, -22, 0), new THREE.Vector3(24, 10, 0));
  const g = new THREE.Group();
  const geo = new THREE.TubeGeometry(curve, 40, 8, 6, false);
  g.add(new THREE.Mesh(geo, M.lacquer('#f5d330', 0.35)));
  for (const t of [0, 1]) {
    const p = curve.getPoint(t);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), M.lacquer('#5a3b12', 0.5));
    tip.position.copy(p);
    g.add(tip);
  }
  return g;
}
function ingotModel() {
  const shape = new THREE.Shape([new THREE.Vector2(-22, -9), new THREE.Vector2(22, -9), new THREE.Vector2(16, 9), new THREE.Vector2(-16, 9)]);
  const geo = new THREE.ExtrudeGeometry(shape, bevel(20, 1.5, 3));
  const g = new THREE.Group();
  const mat = M.gold('#f7c948', 0.16);
  const place = (x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2 + 0.5;
    m.position.set(x, y, z);
    g.add(m);
  };
  place(-24, -8, 0);
  place(24, -8, 0);
  place(0, 10, -6);
  return g;
}
function crownModel(mat, gemMat) {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(22, 20, 12, 48, 1, true), mat);
  band.material.side = THREE.DoubleSide;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(5, 18, 16), mat);
    spike.position.set(Math.cos(a) * 21, 14, Math.sin(a) * 21);
    g.add(spike);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), mat);
    ball.position.set(Math.cos(a) * 21, 24, Math.sin(a) * 21);
    g.add(ball);
    if (gemMat) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(3.4), gemMat);
      gem.position.set(Math.cos(a) * 22.5, 0, Math.sin(a) * 22.5);
      g.add(gem);
    }
  }
  g.rotation.x = 0.35;
  return g;
}
function ringModel(metal, stone) {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(18, 3.6, 24, 64), metal);
  band.rotation.x = 1.15;
  band.position.y = -6;
  g.add(band);
  const s = brilliant(stone, { seg: 12 });
  s.scale.setScalar(0.55);
  s.position.set(0, 14, 4);
  g.add(s);
  return g;
}
function volcanoModel() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(9, 30, 34, 9, 3), M.obsidian());
  cone.geometry.computeVertexNormals();
  g.add(cone);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 1, 24), M.glow('#ff6a0a'));
  crater.position.y = 17.2;
  g.add(crater);
  const lava = M.glow('#ff8a1a');
  for (const [x, len, rot] of [[-4, 18, 0.28], [3, 24, -0.2], [7, 12, -0.5]]) {
    const d = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, len, 6, 12), lava);
    d.position.set(x + (x > 0 ? 4 : -4), 17 - len / 2, 6 + Math.abs(x));
    d.rotation.z = rot;
    g.add(d);
  }
  const plume = M.glow('#ffb020');
  for (const [x, y, r] of [[0, 26, 5], [-6, 33, 4], [5, 36, 3.2], [-1, 42, 2.4]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), plume);
    b.position.set(x, y, 0);
    g.add(b);
  }
  g.rotation.x = 0.15;
  return g;
}
function cometModel() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 3), M.glow('#ffe27a'));
  g.add(head);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(8.5, 46, 32, 1, true), M.glow('#ff3dcb'));
  tail.material.side = THREE.DoubleSide;
  tail.position.set(-16, 16, -4);
  tail.rotation.z = 0.785;
  g.add(tail);
  const tail2 = new THREE.Mesh(new THREE.ConeGeometry(4.5, 36, 24, 1, true), M.glow('#35e0ff'));
  tail2.material.side = THREE.DoubleSide;
  tail2.position.set(-14, 11, 3);
  tail2.rotation.z = 0.9;
  g.add(tail2);
  return g;
}
function shipWheel(wood, brass) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(26, 3.8, 20, 64), wood));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 60, 12), wood);
    spoke.rotation.z = a;
    g.add(spoke);
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 6, 8, 12), wood);
    handle.position.set(Math.cos(a + Math.PI / 2) * 34, Math.sin(a + Math.PI / 2) * 34, 0);
    handle.rotation.z = a;
    g.add(handle);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 6, 32), brass);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  return g;
}

// ---------------------------------------------------------------- per-style symbol builders
const accentOf = (spec) => spec.c1;

async function buildSymbol(spec) {
  const { style, kind, svg, text, bars, c1, c2, glyph, symbol, role } = spec;
  const F = { printed: 'bungee', gem: 'cormorant', coin: 'cinzel', ember: 'anton', bubble: 'lilita', ink: 'pirata', neon: 'orbitron', enamel: 'limelight' }[style];

  // Classic BAR plates
  if (kind === 'bars') {
    const g = new THREE.Group();
    for (let i = 0; i < bars; i++) {
      const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(56, 16, 4), bevel(4, 1.4)), M.lacquer('#0b0b0d', 0.18));
      plate.position.y = (i - (bars - 1) / 2) * -21;
      g.add(plate);
      const t = await text3d('BAR', 'bungee', 10.5, 2.5, [M.chrome('#f4f6fa', 0.3), M.gold('#f4c451', 0.3)]);
      t.position.set(0, plate.position.y, 6.5);
      g.add(t);
    }
    return g;
  }

  // Letters and numbers: 3D type in the machine's face and material
  if (kind === 'text') {
    const str = text;
    const size = str.length > 1 ? 30 : 40;
    const mats = {
      printed: [M.lacquer(c1, 0.12), M.gold('#f4c451', 0.2)],
      gem: [M.chrome('#f4f7fc', 0.06), M.gold('#e8cf9a', 0.16)],
      coin: [M.gold('#8a5f0c', 0.3), M.gold('#f2c14e', 0.18)],
      ember: [M.glow('#ff7410'), M.gold('#8a3208', 0.3)],
      bubble: [M.white(), M.candy(c2)],
      ink: [str === 'K' || str === 'J' ? M.gold('#e0a83a', 0.25) : M.lacquer(c1, 0.25), M.brass()],
      neon: [M.glow(c1), M.chrome('#2a2f44', 0.2)],
      enamel: [M.gold('#f6de98', 0.14), M.gold('#8a6a24', 0.28)],
    };
    const t = await text3d(str, F, size, style === 'neon' ? 5 : 9, mats[style], style === 'neon' ? 0.8 : 1.8);
    if (style === 'coin') {
      const box = new THREE.Box3().setFromObject(t).getSize(new THREE.Vector3());
      t.scale.setScalar(Math.min(1, 34 / Math.max(box.x, box.y)));
      return coinModel(t, M.gold('#f2c14e', 0.18));
    }
    if (style === 'enamel') return medallion(t);
    if (style === 'bubble') return candyPlate(c1, c2, t);
    if (style === 'ember') return obsidianPlate(t);
    return t;
  }

  // Hand-built models for the key symbols
  const byGlyph = {
    brilliant: () => brilliant(M.gem(role === 'wild' ? '#e9ddff' : '#dff4ff')),
    ovalCut: () => brilliant(M.gem('#e0163f'), { seg: 14, sx: 0.8, sy: 1 }),
    cushionCut: () => brilliant(M.gem('#1e4fd6'), { seg: 8 }),
    emeraldCut: () => stepCut(M.gem('#0e9a63')),
    ring: () => ringModel(M.gold(style === 'enamel' ? '#f1d68a' : '#f4c451', 0.14), M.gem('#eef8ff')),
    coin: () => coinModel(new THREE.Mesh(new THREE.ExtrudeGeometry(star(5, 13, 6), bevel(2, 1)), M.gold('#ffe08a', 0.12)), M.gold('#e8b43a', 0.2)),
    ingot: () => ingotModel(),
  };
  if (glyph && byGlyph[glyph]) return byGlyph[glyph]();
  const bySymbol = {
    'lucky7s:cherry': cherryModel,
    'lucky7s:lemon': () => lemonModel('#f7cf1c'),
    'lucky7s:bell': () => bellModel(M.gold('#f4c451', 0.18)),
    'tropical:grape': () => candyPlate(c1, c2, grapeModel('#7d3ad1')),
    'tropical:banana': () => candyPlate(c1, c2, bananaModel()),
    'tropical:cherry': () => candyPlate(c1, c2, cherryModel()),
    'diamondRoyale:crown': () => crownModel(M.gold('#f1d68a', 0.15), M.gem('#1e4fd6')),
    'inferno:volcano': () => obsidianPlate(volcanoModel(), 1.3),
    'cosmic:comet': cometModel,
    'royal:crown': () => medallion(crownModel(M.gold('#f1d68a', 0.15), M.gem('#c0183a'))),
  };
  const key = `${spec.machine}:${symbol}`;
  if (bySymbol[key]) return bySymbol[key]();

  // Filled glyphs extruded; stroke icons as tubes; both dressed per style
  if (kind === 'fill') {
    const pick = (fill, i) => {
      const col = fill.startsWith('url') ? (i % 2 ? c2 : c1) : fill;
      const dark = /^#[0-3]/.test(col);
      if (style === 'ember') return dark ? M.obsidian() : M.glow(i % 2 ? '#ffb020' : '#ff6a0a');
      if (style === 'neon') return dark ? M.chrome('#20243a', 0.2) : M.glow(col);
      if (style === 'coin' || glyph === 'idol' || glyph === 'mask') return M.gold(col.startsWith('#1') || col.startsWith('#0') ? '#3a2502' : '#f4c451', 0.2);
      if (style === 'enamel' && glyph === 'crest') return i === 1 ? M.lacquer('#5a0f1e') : M.gold('#f1d68a', 0.15);
      if (glyph === 'seven') return role === 'wild' ? M.gold('#ffcf4a', 0.14) : M.lacquer('#d60a24', 0.1);
      return M.lacquer(col, 0.25);
    };
    const g = extrudeSvgFill(svg, pick);
    if (style === 'ember') return obsidianPlate(center(g));
    if (style === 'enamel' && glyph !== 'crest' && glyph !== 'seal') return medallion(center(g));
    return g;
  }
  // stroke icons
  const strokeMat = {
    printed: M.lacquer(c1, 0.15),
    gem: M.gold('#f1d68a', 0.14),
    coin: M.gold('#fff0b8', 0.15),
    ember: M.glow('#ff8a1a'),
    bubble: M.white(),
    ink: M.brass(),
    neon: M.glow(c1),
    enamel: M.gold('#f1d68a', 0.15),
  }[style];
  const icon = tubeSvgStroke(svg, strokeMat, style === 'neon' ? 0.9 : 1.15);
  if (style === 'coin') {
    const c = center(icon);
    c.scale.setScalar(1.35);
    return coinModel(c, M.gold('#e0a92e', 0.22));
  }
  if (style === 'enamel') return medallion(center(icon), 1.6);
  if (style === 'bubble') return candyPlate(c1, c2, center(icon), 1.7);
  if (style === 'ember') return obsidianPlate(center(icon), 1.6);
  return icon;
}

function medallion(inner, scale = 1) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(27, 27, 5, 64), M.enamel());
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(27, 2.6, 20, 64), M.gold('#e0bd62', 0.16));
  g.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(22.5, 0.9, 12, 64), M.gold('#8a6a24', 0.3));
  rim2.position.z = 2.6;
  g.add(rim2);
  const c = center(inner);
  const box = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
  c.scale.setScalar((30 / Math.max(box.x, box.y)) * scale * 0.9);
  c.position.z = 5;
  g.add(c);
  return g;
}
function candyPlate(c1, c2, inner, scale = 1) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(48, 48, 15), bevel(6, 5, 8)), M.candy(c2));
  plate.position.z = -8;
  g.add(plate);
  const c = center(inner);
  const box = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
  c.scale.setScalar((36 / Math.max(box.x, box.y)) * scale * 0.9);
  c.position.z = 8;
  g.add(c);
  return g;
}
function obsidianPlate(inner, scale = 1) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(polygon(6, 30, Math.PI / 2), bevel(5, 2.5, 2)), M.obsidian());
  plate.position.z = -6;
  g.add(plate);
  const c = center(inner);
  const box = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
  c.scale.setScalar((34 / Math.max(box.x, box.y)) * scale * 0.9);
  c.position.z = 5;
  g.add(c);
  return g;
}

// ---------------------------------------------------------------- logos, buttons, frames
async function buildLogo(spec) {
  const { machine, text, fontName } = spec;
  const mats = {
    lucky7s: [M.lacquer('#ff2a3d', 0.1), M.chrome('#f2f4f8', 0.08)],
    diamondRoyale: [M.chrome('#f6f8fc', 0.05), M.gold('#e8cf9a', 0.14)],
    goldenFortune: [M.gold('#ffd966', 0.14), M.gold('#8c6414', 0.3)],
    inferno: [M.glow('#ff7a10'), M.gold('#8a3208', 0.3)],
    tropical: [M.candy('#ffe45c'), M.candy('#ff6f59')],
    pirates: [M.gold('#f0c25a', 0.22), M.wood('#3a2415')],
    cosmic: [M.glow('#39e6ff'), M.chrome('#3b2a6a', 0.15)],
    royal: [M.gold('#f6de98', 0.12), M.gold('#6e5018', 0.3)],
  }[machine];
  const g = new THREE.Group();
  const front = await text3d(text, fontName, 30, 12, mats, 2.2);
  g.add(front);
  g.rotation.x = -0.28;
  return g;
}

function buildSpin(machine) {
  const g = new THREE.Group();
  const dome = (mat, r = 30, h = 17) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r + 0.01, Math.sin(a) * h));
    }
    pts.unshift(new THREE.Vector2(r, -4));
    pts.unshift(new THREE.Vector2(0.01, -4));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 72), mat);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const rim = (mat, r = 31, t = 3.4) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 24, 72), mat);
  switch (machine) {
    case 'lucky7s':
      g.add(dome(M.lacquer('#c8081f', 0.2)), rim(M.chrome('#eef1f5', 0.2)));
      break;
    case 'diamondRoyale': {
      g.add(dome(M.lacquer('#1a47c8', 0.08)), rim(M.gold('#e8cf9a', 0.12)));
      const gem = brilliant(M.gem('#dff4ff'), { seg: 16 });
      gem.rotation.x = Math.PI / 2;
      gem.scale.setScalar(0.42);
      gem.position.z = 20;
      g.add(gem);
      break;
    }
    case 'goldenFortune': {
      g.add(dome(M.gold('#f4c451', 0.18), 30, 7), rim(M.gold('#b5820f', 0.26)));
      const s = new THREE.Mesh(new THREE.ExtrudeGeometry(star(8, 22, 17), bevel(1, 0.8)), M.gold('#ffe08a', 0.2));
      s.position.z = 6.5;
      g.add(s);
      break;
    }
    case 'inferno': {
      g.add(dome(M.glow('#ff5a0a', 1.5)), rim(M.obsidian(), 31, 5));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const crack = new THREE.Mesh(new THREE.BoxGeometry(22, 1.4, 1.4), M.obsidian());
        crack.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 10);
        crack.rotation.z = a;
        g.add(crack);
      }
      break;
    }
    case 'tropical':
      g.add(dome(M.candy('#ff5a44')), rim(M.candy('#0fb5ae'), 31, 3.8));
      break;
    case 'pirates':
      g.add(dome(M.gold('#e0a83a', 0.3), 22, 8));
      g.add(shipWheel(M.wood('#6b4423'), M.brass()));
      break;
    case 'cosmic':
      g.add(dome(M.lacquer('#2a1466', 0.08)), rim(M.glow('#35e0ff', 2.2), 30.5, 2), rim(M.glow('#ff3dcb', 2), 34, 1.2));
      break;
    case 'royal':
      g.add(dome(M.lacquer('#7a0f22', 0.1)), rim(M.gold('#e0bd62', 0.14)), rim(M.gold('#8a6a24', 0.3), 35, 1.4));
      break;
  }
  // inner bead: a second, finer ring reads as a machined bezel
  const beadMat = { lucky7s: M.chrome(), diamondRoyale: M.gold('#e8cf9a'), goldenFortune: M.gold('#8c6414'), inferno: M.gold('#8a3208'), tropical: M.candy('#ffe45c'), pirates: null, cosmic: M.glow('#ff3dcb'), royal: M.gold('#e0bd62') }[machine];
  if (beadMat) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(24, 1.1, 16, 72), beadMat);
    b.position.z = 13;
    g.add(b);
  }
  g.rotation.x = -0.1;
  return g;
}

function buildFrame(machine) {
  // A 400x300 ring, 30 thick, seen head-on (orthographic): used as a 9-slice border image.
  const W = 400, H = 300, T = 30;
  const outer = roundedRect(W, H, 26);
  outer.holes.push(roundedRect(W - 2 * T, H - 2 * T, 12));
  const g = new THREE.Group();
  const mat = {
    lucky7s: M.chrome('#e9edf2', 0.1),
    diamondRoyale: M.chrome('#f1f3f8', 0.08),
    goldenFortune: M.gold('#e8b43a', 0.22),
    inferno: M.obsidian(),
    tropical: M.wood('#c89a5c'),
    pirates: M.wood('#4a2e18'),
    cosmic: M.chrome('#3a4058', 0.25),
    royal: M.gold('#e0bd62', 0.16),
  }[machine];
  // flat backing, then a rounded moulding and an inner bead: curved profiles catch light like cast metal
  g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 4, bevelEnabled: false }), mat));
  const loop = (w, h, r) => {
    const pts = roundedRect(w, h, r).getSpacedPoints(240).map((p) => new THREE.Vector3(p.x, p.y, 0));
    return new THREE.CatmullRomCurve3(pts, true);
  };
  const moulding = new THREE.Mesh(new THREE.TubeGeometry(loop(W - T, H - T, 20), 480, T / 2 - 1, 24, true), mat);
  moulding.scale.z = 0.7;
  moulding.position.z = 8;
  g.add(moulding);
  const accentMat = {
    lucky7s: M.gold('#f4c451', 0.2),
    diamondRoyale: M.gold('#e8cf9a', 0.14),
    goldenFortune: M.gold('#8c6414', 0.3),
    inferno: M.glow('#ff5a0a', 2),
    tropical: M.candy('#0fb5ae'),
    pirates: M.brass(),
    cosmic: M.glow('#35e0ff', 2.4),
    royal: M.enamel(),
  }[machine];
  const bead = new THREE.Mesh(new THREE.TubeGeometry(loop(W - 2 * T + 2, H - 2 * T + 2, 12), 480, 3.2, 16, true), accentMat);
  bead.position.z = 12;
  g.add(bead);
  const outerBead = new THREE.Mesh(new THREE.TubeGeometry(loop(W - 4, H - 4, 24), 480, 2.4, 16, true), accentMat);
  outerBead.position.z = 8;
  g.add(outerBead);
  // corner ornaments (corners are never stretched by the 9-slice)
  const corners = [[-W / 2 + T / 2, -H / 2 + T / 2], [W / 2 - T / 2, -H / 2 + T / 2], [-W / 2 + T / 2, H / 2 - T / 2], [W / 2 - T / 2, H / 2 - T / 2]];
  for (const [x, y] of corners) {
    let orn;
    if (machine === 'diamondRoyale') {
      orn = brilliant(M.gem(x < 0 === y < 0 ? '#1e4fd6' : '#e0163f'), { seg: 10 });
      orn.scale.setScalar(0.5);
    } else if (machine === 'lucky7s') orn = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), M.glow('#ffb547', 2));
    else if (machine === 'pirates') orn = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), M.brass());
    else if (machine === 'royal') orn = new THREE.Mesh(new THREE.ExtrudeGeometry(polygon(4, 12, 0), bevel(3, 2)), M.gold('#f1d68a', 0.12));
    else if (machine === 'cosmic') orn = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 6), M.glow('#ff3dcb', 2.2));
    else if (machine === 'inferno') orn = new THREE.Mesh(new THREE.DodecahedronGeometry(9), M.glow('#ffb020', 1.6));
    else if (machine === 'goldenFortune') orn = new THREE.Mesh(new THREE.ExtrudeGeometry(star(8, 12, 7), bevel(3, 1.5)), M.gold('#ffe08a', 0.14));
    else orn = new THREE.Mesh(new THREE.TorusGeometry(7, 3, 12, 24), M.candy('#ff6f59'));
    orn.position.set(x, y, 22);
    g.add(orn);
  }
  return { group: g, W: W + 20, H: H + 20 };
}

// ---------------------------------------------------------------- render
function lights(scene, warm = false, env = envTex) {
  scene.environment = env;
  const key = new THREE.DirectionalLight(warm ? 0xfff1d6 : 0xffffff, 2.2);
  key.position.set(-40, 60, 80);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd9ff, 1.4);
  rim.position.set(60, -20, -40);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
}

function shoot(obj, w, h, { fill = 0.84, tilt = true, ortho = false, warm = false, env = envTex } = {}) {
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  lights(scene, warm, env);
  const root = center(obj);
  if (tilt) {
    root.rotation.x = -0.22;
    root.rotation.y = 0.28;
  }
  scene.add(root);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  let cam;
  if (ortho) {
    cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 2000);
    cam.position.set(c.x, c.y, 500);
    const s = Math.min(w / size.x, h / size.y) * fill;
    root.scale.setScalar(s);
    cam.lookAt(c.x, c.y, 0);
  } else {
    cam = new THREE.PerspectiveCamera(28, w / h, 1, 5000);
    const fitH = Math.max(size.y, size.x / (w / h)) / fill;
    const dist = fitH / 2 / Math.tan((28 * Math.PI) / 360) + size.z;
    cam.position.set(c.x, c.y, c.z + dist);
    cam.lookAt(c);
  }
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.traverse((o) => o.geometry?.dispose());
  return url;
}

window.render = async (spec) => {
  if (spec.type === 'symbol') return shoot(await buildSymbol(spec), 320, 320, { fill: 0.86, warm: spec.style === 'coin' });
  if (spec.type === 'logo') return shoot(await buildLogo(spec), 1200, 400, { fill: 0.94, tilt: false });
  if (spec.type === 'spin') return shoot(buildSpin(spec.machine), 360, 360, { fill: 0.92, tilt: false, env: ['goldenFortune', 'pirates'].includes(spec.machine) ? envTex : envDome });
  if (spec.type === 'frame') {
    const f = buildFrame(spec.machine);
    return shoot(f.group, 440, 330, { fill: 1, tilt: false, ortho: true });
  }
  throw new Error('unknown spec');
};
window.ready = true;
