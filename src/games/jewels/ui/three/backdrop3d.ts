// The world behind the board, rendered in 3D once at the screen's native resolution (sharp on 4K screens)
// and handed back as an image: the sky with its divine light, the great marble temple on its stairway,
// floating islands with shrines, and banks of clouds. No frame loop: the renderer is released right after.
// The composition adapts to the aspect: on a phone the temple crowns the top of the screen, on a wide
// screen the islands and colonnades fill the sides.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function marbleMap(): THREE.CanvasTexture {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#f3eee4';
  x.fillRect(0, 0, size, size);
  const r = rng(11);
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(${150 + r() * 40},${140 + r() * 30},${125 + r() * 30},${0.08 + r() * 0.18})`;
    x.lineWidth = 0.5 + r() * 2.5;
    x.beginPath();
    let px = r() * size;
    let py = -10;
    x.moveTo(px, py);
    while (py < size + 10) {
      px += (r() - 0.5) * 70;
      py += 25 + r() * 40;
      x.quadraticCurveTo(px + (r() - 0.5) * 50, py - 15, px, py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function puffTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d')!;
  const r = rng(5);
  // A cloud puff: several soft blobs, brighter on top.
  for (let i = 0; i < 14; i++) {
    const cx = 128 + (r() - 0.5) * 110;
    const cy = 140 + (r() - 0.5) * 60;
    const rad = 40 + r() * 50;
    // Lit from above: bright tops, cool lavender-grey undersides.
    const g = x.createRadialGradient(cx - rad * 0.2, cy - rad * 0.45, rad * 0.1, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(236,238,250,0.8)');
    g.addColorStop(0.8, 'rgba(176,186,222,0.45)');
    g.addColorStop(1, 'rgba(160,170,210,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, rad, 0, Math.PI * 2);
    x.fill();
  }
  return new THREE.CanvasTexture(cv);
}

function glowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d')!;
  const grad = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,248,220,1)');
  grad.addColorStop(0.25, 'rgba(255,230,170,0.55)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

function skyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float h = vDir.y;
        vec3 zenith = vec3(0.02, 0.04, 0.14);
        vec3 mid = vec3(0.1, 0.22, 0.55);
        vec3 horizon = vec3(0.98, 0.8, 0.55);
        vec3 col = h > 0.08 ? mix(mid, zenith, smoothstep(0.08, 0.6, h)) : mix(horizon, mid, smoothstep(-0.06, 0.08, h));
        // Divine light behind the temple.
        vec3 sunDir = normalize(vec3(0.0, 0.2, -1.0));
        float d = max(dot(vDir, sunDir), 0.0);
        col += vec3(1.0, 0.88, 0.6) * (pow(d, 24.0) * 0.8 + pow(d, 5.0) * 0.18);
        // Stars high up.
        vec3 grid = vDir * 260.0;
        vec3 cell = floor(grid);
        float star = step(0.992, hash(cell)) * smoothstep(0.3, 0.75, h);
        float dotShape = 1.0 - smoothstep(0.05, 0.22, length(fract(grid) - 0.5));
        col += star * dotShape * (0.5 + hash(cell + 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

interface Kit {
  marble: THREE.MeshStandardMaterial;
  marbleDark: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  doorway: THREE.MeshBasicMaterial;
  doorGlow: THREE.SpriteMaterial;
}

/** A fluted Doric-style column with base and capital. */
function column(k: Kit, h: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(r * 0.9, r, h, 20, 1, false);
  const s = new THREE.Mesh(shaft, k.marble);
  s.position.y = h / 2;
  g.add(s);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.35, r * 0.5, 24), k.marble);
  base.position.y = r * 0.25;
  g.add(base);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r * 0.95, r * 0.45, 24), k.marble);
  cap.position.y = h - r * 0.1;
  g.add(cap);
  const abacus = new THREE.Mesh(new THREE.BoxGeometry(r * 2.9, r * 0.3, r * 2.9), k.marble);
  abacus.position.y = h + r * 0.2;
  g.add(abacus);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.08, 8, 24), k.gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = h - r * 0.4;
  g.add(ring);
  return g;
}

/** A temple: stepped stylobate, a colonnade, entablature with a gold frieze, a pediment. */
function temple(k: Kit, cols: number, width: number, height: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const w = width + (steps - i) * 0.5;
    const d = depth + (steps - i) * 0.5;
    const step = new THREE.Mesh(new RoundedBoxGeometry(w, 0.25, d, 2, 0.03), k.marble);
    step.position.y = 0.125 + i * 0.25;
    g.add(step);
  }
  const floorY = steps * 0.25;
  const r = width / (cols * 5.2);
  for (const z of [depth / 2 - r * 1.6, -depth / 2 + r * 1.6])
    for (let i = 0; i < cols; i++) {
      const c = column(k, height, r);
      c.position.set(-width / 2 + r * 1.8 + (i * (width - r * 3.6)) / (cols - 1), floorY, z);
      g.add(c);
    }
  // The cella: the inner sanctum behind the colonnade, with a glowing golden doorway.
  const cella = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, height, depth * 0.55), k.marbleDark);
  cella.position.y = floorY + height / 2;
  g.add(cella);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.16, height * 0.62), k.doorway);
  door.position.set(0, floorY + height * 0.31, (depth * 0.55) / 2 + 0.01);
  g.add(door);
  const shine = new THREE.Sprite(k.doorGlow);
  shine.position.set(0, floorY + height * 0.34, (depth * 0.55) / 2 + 0.3);
  shine.scale.set(width * 0.5, height * 0.95, 1);
  g.add(shine);
  const topY = floorY + height + r * 0.35;
  const arch = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.45, depth + 0.2), k.marble);
  arch.position.y = topY + 0.225;
  g.add(arch);
  const frieze = new THREE.Mesh(new THREE.BoxGeometry(width + 0.26, 0.12, depth + 0.26), k.gold);
  frieze.position.y = topY + 0.5;
  g.add(frieze);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(width + 0.45, 0.16, depth + 0.45), k.marble);
  cornice.position.y = topY + 0.64;
  g.add(cornice);
  const tri = new THREE.Shape();
  tri.moveTo(-(width + 0.45) / 2, 0);
  tri.lineTo((width + 0.45) / 2, 0);
  tri.lineTo(0, width * 0.22);
  tri.closePath();
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: depth + 0.45, bevelEnabled: false }), k.marble);
  ped.position.set(0, topY + 0.72, -(depth + 0.45) / 2);
  g.add(ped);
  const tympanum = new THREE.Shape();
  tympanum.moveTo(-(width * 0.8) / 2, 0.08);
  tympanum.lineTo((width * 0.8) / 2, 0.08);
  tympanum.lineTo(0, width * 0.18);
  tympanum.closePath();
  const tym = new THREE.Mesh(new THREE.ShapeGeometry(tympanum), k.marbleDark);
  tym.position.set(0, topY + 0.72, (depth + 0.45) / 2 + 0.01);
  g.add(tym);
  const acro = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), k.gold);
  acro.position.set(0, topY + 0.72 + width * 0.22 + 0.1, (depth + 0.45) / 2);
  g.add(acro);
  return g;
}

/** A floating island: a jagged rock cone with a grassy top. */
function island(k: Kit, radius: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const rockGeo = new THREE.ConeGeometry(radius, radius * 2.2, 9, 4);
  const pos = rockGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < radius * 1.05) {
      pos.setX(i, pos.getX(i) * (0.8 + r() * 0.45));
      pos.setZ(i, pos.getZ(i) * (0.8 + r() * 0.45));
      pos.setY(i, y + (r() - 0.5) * radius * 0.25);
    }
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeo, k.rock);
  rock.rotation.x = Math.PI;
  rock.position.y = -radius * 1.1;
  g.add(rock);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 0.95, radius * 0.18, 18), k.grass);
  top.position.y = -radius * 0.05;
  g.add(top);
  return g;
}

export interface BackdropOptions {
  width: number;
  height: number;
  /** Device pixels per CSS pixel (capped by the caller). */
  dpr: number;
}

/** Render the Olympus backdrop and return it as an image URL (JPEG), or null without WebGL. */
export function renderBackdrop({ width, height, dpr }: BackdropOptions): string | null {
  const W = Math.max(1, Math.round(width * dpr));
  const H = Math.max(1, Math.round(height * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const aspect = W / H;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#9fb0dc', 42, 100);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), track(skyMaterial()));
  (sky.material as THREE.ShaderMaterial).fog = false;
  scene.add(sky);

  const marbleTex = track(marbleMap());
  const glowTex = track(glowTexture());
  const k: Kit = {
    marble: track(new THREE.MeshStandardMaterial({ map: marbleTex, color: '#fffaf0', roughness: 0.42, metalness: 0 })),
    marbleDark: track(new THREE.MeshStandardMaterial({ map: marbleTex, color: '#b9ad98', roughness: 0.6 })),
    gold: track(new THREE.MeshStandardMaterial({ color: '#f0c050', metalness: 1, roughness: 0.28, emissive: '#3b2600' })),
    rock: track(new THREE.MeshStandardMaterial({ color: '#8a7a68', roughness: 0.95, flatShading: true })),
    grass: track(new THREE.MeshStandardMaterial({ color: '#7fae62', roughness: 0.9, flatShading: true })),
    doorway: track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd98a').multiplyScalar(1.6) })),
    doorGlow: track(new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf6e', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 })),
  };

  // Light: a warm sun behind and above the temple, a cool sky fill, a soft front light.
  scene.add(new THREE.HemisphereLight('#bcd2ff', '#8a7358', 0.75));
  const sun = new THREE.DirectionalLight('#ffe0a0', 3.4);
  sun.position.set(-12, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.target.position.set(0, 3, -12);
  scene.add(sun.target);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const back = new THREE.DirectionalLight('#ffd27a', 1.4);
  back.position.set(4, 10, -30);
  scene.add(back);
  const front = new THREE.DirectionalLight('#dfe8ff', 0.5);
  front.position.set(6, 4, 14);
  scene.add(front);

  // The great temple on its stairway.
  const great = temple(k, 8, 9, 5.2, 5);
  great.position.set(0, 3.2, -14);
  great.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  scene.add(great);
  for (let i = 0; i < 14; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(6.5 + i * 0.35, 0.23, 0.9), k.marble);
    step.position.set(0, 3.2 - i * 0.23, -10.6 + i * 0.9);
    step.receiveShadow = true;
    step.castShadow = true;
    scene.add(step);
  }
  // Gold braziers flanking the stairway.
  for (const side of [-1, 1]) {
    const post = column(k, 2.2, 0.22);
    post.position.set(side * 4.2, 0, -5);
    scene.add(post);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), k.gold);
    bowl.rotation.x = Math.PI;
    bowl.position.set(side * 4.2, 2.95, -5);
    scene.add(bowl);
    const flame = new THREE.PointLight('#ffb347', 6, 8);
    flame.position.set(side * 4.2, 3.4, -5);
    scene.add(flame);
  }

  // Floating islands with shrines, spread wider on wide screens.
  const spread = Math.max(1, aspect / 0.6);
  const isles: [number, number, number, number, number][] = [
    [-8.5, 6.5, -18, 2.4, 3],
    [8.8, 5.2, -17, 2.8, 7],
    [-15, 2.5, -24, 3.2, 13],
    [16, 3.5, -26, 3.4, 17],
    [-5.5, 10.5, -30, 1.8, 23],
    [6.5, 11.5, -32, 2, 29],
  ];
  for (const [x, y, z, rad, seed] of isles) {
    const g = island(k, rad, seed);
    g.position.set(x * Math.min(spread, 2.2), y, z);
    const shrine = temple(k, 4, rad * 1.1, rad * 0.75, rad * 0.8);
    shrine.scale.setScalar(0.8);
    shrine.position.y = 0.05;
    g.add(shrine);
    g.rotation.y = (seed % 5) * 0.3;
    scene.add(g);
  }

  // Colonnades at the sides (visible on wide screens).
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const c = column(k, 8, 0.55);
      c.position.set(side * (9 + i * 0.2) * Math.max(1, spread * 0.85), -3, 2 - i * 5);
      c.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
      scene.add(c);
    }

  // Cloud banks: soft sprites, lit from above, thicker at the bottom of the frame.
  const puff = track(puffTexture());
  const r = rng(99);
  const cloudMat = (tint: string, op: number) => track(new THREE.SpriteMaterial({ map: puff, color: tint, transparent: true, opacity: op, depthWrite: false }));
  const near = cloudMat('#fff8ee', 0.9);
  const far = cloudMat('#dfe6fa', 0.7);
  // Clouds in clusters (not a blanket): each cluster a few puffs, sunlit gold on the far ones, cool and
  // lavender near the viewer, with gaps between them that open onto the deep sky below.
  const warm = cloudMat('#ffe6b8', 0.85);
  const cool = cloudMat('#e4e2f6', 0.85);
  const cluster = (x: number, y: number, z: number, size: number, mat: THREE.SpriteMaterial) => {
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(i === 0 ? near : mat);
      s.position.set(x + (r() - 0.5) * size * 1.6, y + (r() - 0.3) * size * 0.35, z + (r() - 0.5) * 2);
      const k = size * (0.7 + r() * 0.6);
      s.scale.set(k * 1.6, k * 0.8, 1);
      scene.add(s);
    }
  };
  for (let i = 0; i < 16; i++) cluster((r() - 0.5) * 44 * spread, -1.5 + r() * 2, -8 - r() * 30, 3 + r() * 3, i % 2 ? warm : far);
  for (let i = 0; i < 9; i++) cluster((r() - 0.5) * 24 * spread, -3.6 + r() * 1.2, 5 + r() * 7, 3.5 + r() * 2.5, cool);
  for (let i = 0; i < 10; i++) cluster((r() - 0.5) * 70 * spread, 5 + r() * 12, -36 - r() * 20, 4 + r() * 4, far);

  // Divine glow behind the temple.
  const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })));
  halo.position.set(0, 9, -24);
  halo.scale.set(14, 14, 1);
  (halo.material as THREE.SpriteMaterial).opacity = 0.75;
  scene.add(halo);

  // Camera: a phone frames the temple at the top; wider screens pull back a little.
  // The temple sits in the upper part of the frame, above the board.
  const portrait = aspect < 1;
  const camera = new THREE.PerspectiveCamera(portrait ? 60 : 44, aspect, 0.1, 200);
  camera.position.set(0, portrait ? 1.2 : 2.2, portrait ? 24 : 20);
  camera.lookAt(0, portrait ? 0.4 : 4.2, -14);

  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/jpeg', 0.9);

  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
  for (const d of disposables) d.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
