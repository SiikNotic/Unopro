// The board rendered with WebGL: the painted pieces and the special effects (lightning across a row or
// column, the Temple's golden blast, the Trident's divine portal, the Hammer's burst), drawn from the asset
// pack's sprites with additive light. It mirrors the pieces and effects that useJewelGame produces (same ids,
// cells, phases); the game state never lives here. One orthographic camera maps one world unit to one cell,
// so the canvas lines up exactly with the DOM grid under it (cells, crystal, selection).
//
// The frame loop runs while something moves, and keeps running for the idle shine only when animations are
// on; it stops when the tab is hidden and on dispose (every GPU object released).
import * as THREE from 'three';
import type { Special } from '../../engine';
import type { JewelPhase } from '../Jewel';
import type { Effect } from '../useJewelGame';
import type { Kit } from './kit';
import { loadKit } from './kit';
import { buildPiece, disposePiece } from './piece3d';
import type { Piece3D } from './piece3d';

export interface ScenePiece {
  id: number;
  kind: number;
  special: Special | null;
  hp?: number;
  r: number;
  c: number;
  phase: JewelPhase;
  dropFrom?: number;
}

interface Rec {
  view: Piece3D;
  kind: number;
  special: Special | null;
  hp?: number;
  x: number;
  y: number;
  move: { fx: number; fy: number; tx: number; ty: number; t0: number; dur: number; drop: boolean } | null;
  phase: JewelPhase;
  phaseT0: number;
  seed: number;
  selected: boolean;
  lift: number;
}

interface FxRec {
  group: THREE.Group;
  t0: number;
  dur: number;
  type: Effect['type'];
  size: number;
  parts: { obj: THREE.Object3D; mat: THREE.Material & { opacity: number } }[];
}

const CLEAR_MS = 230;
const POP_MS = 320;
const HIT_MS = 280;
const FX_MS: Record<Effect['type'], number> = { boltRow: 460, boltCol: 460, wave: 520, divine: 620, hammer: 420 };

/** Fast start, soft landing with a hint of overshoot. */
const easeMove = (t: number) => 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.04 * t;
/** A drop that lands with a small bounce. */
function easeDrop(t: number) {
  if (t < 0.78) return (t / 0.78) ** 2;
  const u = (t - 0.78) / 0.22;
  return 1 - Math.sin(u * Math.PI) * 0.06;
}

export class GemScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private kit: Kit | null = null;
  private recs = new Map<number, Rec>();
  private fx = new Map<number, FxRec>();
  private frame = 0;
  private idle: boolean;
  private lastSkip = false;
  private lite: boolean;
  private disposed = false;
  private pending: { pieces: ScenePiece[]; selected: { r: number; c: number } | null; moveMs: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private rows: number,
    private cols: number,
    opts: { idle: boolean; lite: boolean }
  ) {
    this.idle = opts.idle;
    this.lite = opts.lite;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.OrthographicCamera(0, cols, 0, -rows, 0.1, 50);
    this.camera.position.z = 10;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Load the textures; resolves once the scene can draw. */
  async ready(): Promise<void> {
    const kit = await loadKit(this.renderer);
    if (this.disposed) return kit.dispose();
    this.kit = kit;
    if (this.pending) this.sync(this.pending.pieces, this.pending.selected, this.pending.moveMs);
  }

  resize(width: number, height: number) {
    // Native resolution up to 2.5× (crisp on 4K / high-density screens), less on slow devices.
    const dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.kick();
  }

  setIdle(idle: boolean) {
    this.idle = idle;
    this.kick();
  }

  /** Mirror the current pieces. New ids appear (dropping from `dropFrom`), moved ids glide, gone ids go. */
  sync(pieces: ScenePiece[], selected: { r: number; c: number } | null, moveMs: number) {
    const kit = this.kit;
    if (!kit) {
      this.pending = { pieces, selected, moveMs };
      return;
    }
    this.pending = null;
    const now = performance.now();
    const seen = new Set<number>();
    for (const p of pieces) {
      seen.add(p.id);
      const tx = p.c + 0.5;
      const ty = -(p.r + 0.5);
      let rec = this.recs.get(p.id);
      if (!rec) {
        const view = buildPiece(kit, p.kind, p.special, p.hp);
        this.scene.add(view.root);
        const fromY = p.dropFrom !== undefined ? -(p.dropFrom + 0.5) : ty;
        rec = { view, kind: p.kind, special: p.special, hp: p.hp, x: tx, y: fromY, move: null, phase: p.phase, phaseT0: now, seed: (p.id * 2654435761) % 1000, selected: false, lift: 0 };
        if (fromY !== ty && moveMs > 0) rec.move = { fx: tx, fy: fromY, tx, ty, t0: now, dur: moveMs, drop: true };
        else rec.y = ty;
        this.recs.set(p.id, rec);
      } else {
        if (rec.kind !== p.kind || rec.special !== p.special || rec.hp !== p.hp) {
          // Became a special (or a seal lost a hit): rebuild its look in place.
          disposePiece(rec.view);
          rec.view = buildPiece(kit, p.kind, p.special, p.hp);
          this.scene.add(rec.view.root);
          rec.kind = p.kind;
          rec.special = p.special;
          rec.hp = p.hp;
        }
        const target = rec.move ? { x: rec.move.tx, y: rec.move.ty } : { x: rec.x, y: rec.y };
        if (target.x !== tx || target.y !== ty) {
          if (moveMs > 0) rec.move = { fx: rec.x, fy: rec.y, tx, ty, t0: now, dur: moveMs, drop: false };
          else {
            rec.move = null;
            rec.x = tx;
            rec.y = ty;
          }
        }
        if (rec.phase !== p.phase) {
          rec.phase = p.phase;
          rec.phaseT0 = now;
        }
      }
      rec.selected = !!selected && selected.r === p.r && selected.c === p.c;
    }
    for (const [id, rec] of this.recs)
      if (!seen.has(id)) {
        disposePiece(rec.view);
        this.recs.delete(id);
      }
    this.kick();
  }

  /** Start the sprites of new effects (each plays once, on its own clock). */
  syncEffects(effects: Effect[]) {
    const kit = this.kit;
    if (!kit) return;
    const now = performance.now();
    for (const e of effects) {
      if (this.fx.has(e.id)) continue;
      const group = new THREE.Group();
      const parts: FxRec['parts'] = [];
      const add = (map: THREE.Texture, sx: number, sy: number, x = 0, y = 0, rot = 0, color = '#ffffff') => {
        const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        const m = new THREE.Mesh(kit.quad, mat);
        m.scale.set(sx, sy, 1);
        m.position.set(x, y, 1);
        m.rotation.z = rot;
        group.add(m);
        parts.push({ obj: m, mat });
      };
      const cx = e.c + 0.5;
      const cy = -(e.r + 0.5);
      if (e.type === 'boltRow' || e.type === 'boltCol') {
        const row = e.type === 'boltRow';
        const len = row ? this.cols : this.rows;
        // A chain of lightning sprites along the line, over a pale energy beam.
        add(kit.glow, row ? len + 1 : 1.2, row ? 1.2 : len + 1, row ? this.cols / 2 : cx, row ? cy : -this.rows / 2, 0, '#bfe3ff');
        for (let i = 0; i < len; i++) add(kit.fx.lightning, 1.25, 1.25, row ? i + 0.5 : cx, row ? cy : -(i + 0.5), (row ? Math.PI / 2 : 0) + (i % 2 ? 0.2 : -0.2), '#ffffff');
      } else if (e.type === 'wave') {
        add(kit.fx.ring, 1, 1, cx, cy);
        add(kit.fx.burst, 1.6, 1.6, cx, cy);
      } else if (e.type === 'divine') {
        add(kit.fx.portal, 1, 1, cx, cy, 0, '#cfe6ff');
        add(kit.fx.streak, 2.2, 2.2, cx, cy, 0.4);
        add(kit.glow, 3, 3, cx, cy, 0, '#fff4d2');
      } else {
        add(kit.fx.burst, 1.6, 1.6, cx, cy);
        add(kit.fx.spark, 1.3, 1.3, cx, cy, 0.6);
      }
      this.scene.add(group);
      this.fx.set(e.id, { group, t0: now, dur: FX_MS[e.type], type: e.type, size: e.size ?? 1.5, parts });
    }
    this.kick();
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.kick();
  };

  private kick() {
    if (this.disposed || this.frame || document.hidden || !this.kit) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick = (now: number) => {
    this.frame = 0;
    const fxBusy = this.updateEffects(now);
    const busy = this.update(now) || fxBusy;
    // Idle shine on slow devices: every other frame (30 fps) is plenty.
    const skip = !busy && this.lite && !this.lastSkip;
    this.lastSkip = skip;
    if (!skip) this.renderer.render(this.scene, this.camera);
    if (busy || this.idle) this.kick();
  };

  private updateEffects(now: number): boolean {
    let busy = false;
    for (const [id, f] of this.fx) {
      const k = (now - f.t0) / f.dur;
      if (k >= 1) {
        for (const p of f.parts) p.mat.dispose();
        f.group.removeFromParent();
        this.fx.delete(id);
        continue;
      }
      busy = true;
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      if (f.type === 'boltRow' || f.type === 'boltCol') {
        // Flicker: the bolts jump a little every few frames.
        f.parts.forEach((p, i) => {
          p.mat.opacity = fade * (i === 0 ? 0.55 : 0.75 + 0.25 * Math.sin(now * 0.08 + i * 2.1));
          if (i > 0) p.obj.scale.setScalar(1.15 + 0.2 * Math.sin(now * 0.05 + i));
        });
      } else if (f.type === 'wave' || f.type === 'divine') {
        const grow = 0.6 + k * f.size * 2;
        f.parts.forEach((p, i) => {
          p.mat.opacity = fade * (i === 0 ? 1 : 0.8);
          if (i === 0) p.obj.scale.setScalar(grow);
          p.obj.rotation.z += 0.03;
        });
      } else {
        f.parts.forEach((p, i) => {
          p.mat.opacity = fade;
          p.obj.scale.setScalar((i === 0 ? 1.2 : 1) + k * 1.1);
        });
      }
    }
    return busy;
  }

  /** Advance every piece to `now`; true while something is still animating. */
  private update(now: number): boolean {
    let busy = false;
    const t = now / 1000;
    for (const rec of this.recs.values()) {
      const { view } = rec;
      if (rec.move) {
        const k = Math.min(1, (now - rec.move.t0) / rec.move.dur);
        const e = rec.move.drop ? easeDrop(k) : easeMove(k);
        rec.x = rec.move.fx + (rec.move.tx - rec.move.fx) * e;
        rec.y = rec.move.fy + (rec.move.ty - rec.move.fy) * e;
        if (k >= 1) {
          rec.x = rec.move.tx;
          rec.y = rec.move.ty;
          rec.move = null;
        } else busy = true;
      }
      // Selection lifts the piece a little.
      const liftTarget = rec.selected ? 1 : 0;
      if (Math.abs(rec.lift - liftTarget) > 0.01) {
        rec.lift += (liftTarget - rec.lift) * 0.3;
        busy = true;
      } else rec.lift = liftTarget;

      let scale = 1 + rec.lift * 0.12;
      let shake = 0;
      let spinZ = 0;
      let flash = 0;
      let opacity = 1;
      let glowBoost = 0;
      const pt = now - rec.phaseT0;
      switch (rec.phase) {
        case 'clear': {
          const k = Math.min(1, pt / CLEAR_MS);
          scale *= k < 0.35 ? 1 + (k / 0.35) * 0.25 : 1.25 - ((k - 0.35) / 0.65) * 1.2;
          spinZ = k * 0.8;
          flash = k < 0.35 ? k / 0.35 : 1;
          opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          glowBoost = 1.2 * (1 - k);
          if (k < 1) busy = true;
          break;
        }
        case 'pop': {
          const k = Math.min(1, pt / POP_MS);
          scale *= 0.5 + 0.5 * Math.min(1, k * 1.6) * (1 + Math.sin(k * Math.PI) * 0.3 * (1 - k));
          flash = 0.8 * (1 - k);
          glowBoost = 0.9 * (1 - k);
          if (k < 1) busy = true;
          break;
        }
        case 'hint': {
          const w = 0.5 - 0.5 * Math.cos((pt / 1100) * Math.PI * 2);
          scale *= 1 + 0.1 * w;
          glowBoost = 0.5 * w;
          busy = true;
          break;
        }
        case 'target':
          scale *= 1 + 0.12 * (0.5 - 0.5 * Math.cos((pt / 260) * Math.PI));
          busy = true;
          break;
        case 'hit': {
          const k = Math.min(1, pt / HIT_MS);
          shake = Math.sin(k * Math.PI * 4) * 0.07 * (1 - k);
          if (k < 1) busy = true;
          break;
        }
        default:
          break;
      }
      const s = rec.seed;
      const sway = this.idle ? 1 : 0;
      // A gentle bob (idle) so the board breathes; selected pieces pulse.
      const bob = sway * 0.012 * Math.sin(t * 1.6 + s);
      view.root.position.set(rec.x + shake, rec.y + bob + rec.lift * 0.04, rec.lift * 0.3);
      view.body.scale.setScalar(Math.max(0.001, scale * (rec.selected ? 1 + 0.03 * Math.sin(t * 8) : 1)));
      view.body.rotation.z = spinZ;

      // The sweeping shine: every few seconds on each gem, at a different moment for each.
      const cycle = (t * 0.32 + s / 137) % 2.6;
      const shine = sway ? cycle * 1.6 - 0.6 : -1;
      for (const m of view.mats) {
        m.uniforms.shine.value = shine;
        m.uniforms.flash.value = flash;
        m.uniforms.opacity.value = opacity;
      }
      if (view.badge) view.badge.scale.setScalar(0.56 * (1 + sway * 0.05 * Math.sin(t * 3 + s)));
      if (view.spin) view.spin.rotation.z = t * 1.2;

      const glowMat = view.glow.material;
      const base = view.stone ? 0 : view.special ? 0.55 + sway * 0.2 * Math.sin(t * 3 + s) : 0.12;
      glowMat.opacity = Math.max(0, (base + glowBoost + rec.lift * 0.35) * opacity);
      if (view.sparkle) {
        const c2 = (t * 0.45 + s / 97) % 3.4;
        const tw = sway && c2 < 0.45 ? Math.sin((c2 / 0.45) * Math.PI) : 0;
        view.sparkle.material.opacity = tw * opacity;
        view.sparkle.material.rotation = t * 0.8;
        view.sparkle.scale.setScalar(0.28 + tw * 0.2);
      }
    }
    return busy;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const rec of this.recs.values()) disposePiece(rec.view);
    this.recs.clear();
    for (const f of this.fx.values()) for (const p of f.parts) p.mat.dispose();
    this.fx.clear();
    this.kit?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
