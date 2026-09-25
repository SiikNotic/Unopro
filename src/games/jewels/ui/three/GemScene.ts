// The board's pieces rendered in real time with WebGL. It mirrors the pieces list that useJewelGame
// produces (same ids, cells and phases as the DOM jewels) and animates the moves, drops and phases itself;
// the game state never lives here. One orthographic camera maps one world unit to one cell, so the canvas
// lines up exactly with the DOM grid under it (cells, crystal, selection) and the effects over it.
//
// The frame loop runs while something moves, and keeps running for the idle shimmer only when animations
// are on; it stops when the tab is hidden and on dispose (every GPU object released).
import * as THREE from 'three';
import type { Special } from '../../engine';
import type { JewelPhase } from '../Jewel';
import { addLights, GemKit } from './gems3d';
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

const CLEAR_MS = 230;
const POP_MS = 300;
const HIT_MS = 280;

/** cubic-bezier(0.3, 0.9, 0.45, 1.06)-like: fast start, soft landing with a hint of overshoot. */
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
  private kit: GemKit;
  private recs = new Map<number, Rec>();
  private frame = 0;
  private idle: boolean;
  private lastSkip = false;
  private lite: boolean;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    rows: number,
    cols: number,
    opts: { idle: boolean; lite: boolean }
  ) {
    this.idle = opts.idle;
    this.lite = opts.lite;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // No filmic tone mapping: it would wash the stones' saturated colours towards white.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.OrthographicCamera(0, cols, 0, -rows, 0.1, 50);
    this.camera.position.z = 10;
    this.kit = new GemKit(this.renderer);
    addLights(this.scene);
    document.addEventListener('visibilitychange', this.onVisibility);
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
    const now = performance.now();
    const seen = new Set<number>();
    for (const p of pieces) {
      seen.add(p.id);
      const tx = p.c + 0.5;
      const ty = -(p.r + 0.5);
      let rec = this.recs.get(p.id);
      if (!rec) {
        const view = buildPiece(this.kit, p.kind, p.special, p.hp);
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
          rec.view = buildPiece(this.kit, p.kind, p.special, p.hp);
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

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.kick();
  };

  private kick() {
    if (this.disposed || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick = (now: number) => {
    this.frame = 0;
    const busy = this.update(now);
    // Idle shimmer on slow devices: every other frame (30 fps) is plenty.
    const skip = !busy && this.lite && !this.lastSkip;
    this.lastSkip = skip;
    if (!skip) this.renderer.render(this.scene, this.camera);
    if (busy || this.idle) this.kick();
  };

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
      // Selection lifts the piece a little towards the viewer.
      const liftTarget = rec.selected ? 1 : 0;
      if (Math.abs(rec.lift - liftTarget) > 0.01) {
        rec.lift += (liftTarget - rec.lift) * 0.3;
        busy = true;
      } else rec.lift = liftTarget;

      let scale = 1 + rec.lift * 0.12;
      let shake = 0;
      let spinZ = 0;
      let glowBoost = 0;
      const pt = now - rec.phaseT0;
      switch (rec.phase) {
        case 'clear': {
          const k = Math.min(1, pt / CLEAR_MS);
          scale *= k < 0.35 ? 1 + (k / 0.35) * 0.25 : 1.25 - ((k - 0.35) / 0.65) * 1.2;
          spinZ = k * 1.4;
          glowBoost = 1.2 * (1 - k);
          if (k < 1) busy = true;
          break;
        }
        case 'pop': {
          const k = Math.min(1, pt / POP_MS);
          scale *= 0.5 + 0.5 * (1 + Math.sin(k * Math.PI) * 0.35 * (1 - k)) * Math.min(1, k * 1.6);
          glowBoost = 0.8 * (1 - k);
          if (k < 1) busy = true;
          break;
        }
        case 'hint':
          scale *= 1 + 0.1 * (0.5 - 0.5 * Math.cos((pt / 1100) * Math.PI * 2));
          glowBoost = 0.4 * (0.5 - 0.5 * Math.cos((pt / 1100) * Math.PI * 2));
          busy = true;
          break;
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
      view.root.position.set(rec.x + shake, rec.y, rec.lift * 0.3);
      view.body.scale.setScalar(Math.max(0.001, scale));

      // Idle shimmer: each gem sways a little on its own rhythm, so light runs across the facets.
      const s = rec.seed;
      const sway = this.idle ? 1 : 0;
      const speed = rec.selected ? 2.4 : 1;
      view.body.rotation.set(-0.4 + sway * 0.12 * Math.sin(t * 0.8 * speed + s), sway * 0.34 * Math.sin(t * 0.9 * speed + s * 1.7), spinZ);
      if (view.stone) view.body.rotation.set(-0.12, 0.08, 0);
      if (view.spin) view.spin.rotation.set(1.1, 0, t * 1.5);

      const specialPulse = view.special ? 0.25 * Math.sin(t * 3 + s) : 0;
      const glowMat = view.glow.material;
      const base = view.stone ? 0 : view.special ? 0.7 : 0.34;
      glowMat.opacity = Math.max(0, base + specialPulse * sway + glowBoost + rec.lift * 0.3);
      if (view.sparkle) {
        // A twinkle now and then, at a different moment for each gem.
        const cycle = (t * 0.45 + s / 97) % 3.2;
        const tw = this.idle && cycle < 0.5 ? Math.sin((cycle / 0.5) * Math.PI) : 0;
        view.sparkle.material.opacity = tw;
        view.sparkle.material.rotation = t * 0.8;
        view.sparkle.scale.setScalar(0.3 + tw * 0.2);
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
    this.kit.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
