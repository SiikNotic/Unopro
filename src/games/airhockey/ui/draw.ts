// AIR HOCKEY: the table on a canvas, in table units (see table.ts). The owner's painted table (assets/table.webp:
// gold-framed black surface, spade-and-crown emblem, blue LEDs on the AI's side, red on the player's, lit goal slots)
// is fitted to the simulation's geometry: its playing surface covers exactly W × H units, its centre line lands on
// MID and its goal openings on GOAL_X0..GOAL_X1. The mallets and the puck are the owner's sprites, pre-scaled once per
// size. Until an image has loaded, simple drawn stand-ins are used. Purely visual: nothing here decides the match.
import { H, MALLET_R, MID, PUCK_R, W } from '../table';
import type { Body } from '../engine';

/**
 * Where the playing surface sits in the table image (pixels of assets/table.webp, 981 × 1602): its side walls, its
 * end lines, and its centre line. The image's centre line isn't halfway, so the image is fitted in bands: a band
 * around the centre (emblem included) keeps one scale, so the circle stays round; the two outer bands take the rest.
 */
const IMG = { left: 60, right: 918, top: 60, bottom: 1480, line: 742, band: 200, w: 981, h: 1602 };
const SX = W / (IMG.right - IMG.left);
const BAND_U = 240;
const S_TOP = (MID - BAND_U) / (IMG.line - IMG.band - IMG.top);
const S_BOT = (H - MID - BAND_U) / (IMG.bottom - IMG.line - IMG.band);

/** The frame around the playing surface, in table units (the painted frame is heavier at the bottom). */
export const RIM_X = Math.ceil(Math.max(IMG.left, IMG.w - IMG.right) * SX);
export const RIM_T = Math.ceil(IMG.top * S_TOP);
export const RIM_B = Math.ceil((IMG.h - IMG.bottom) * S_BOT);
export const FULL_W = W + RIM_X * 2;
export const FULL_H = H + RIM_T + RIM_B;

const GOLD = '#e8c46a';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

/** A spade of height ~2s centred on (cx, cy). */
export function spadePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.bezierCurveTo(cx + s * 0.55, cy - s * 0.45, cx + s * 1.05, cy - s * 0.05, cx + s * 0.62, cy + s * 0.36);
  ctx.bezierCurveTo(cx + s * 0.36, cy + s * 0.62, cx + s * 0.1, cy + s * 0.46, cx + s * 0.03, cy + s * 0.26);
  ctx.lineTo(cx + s * 0.3, cy + s * 0.9);
  ctx.lineTo(cx - s * 0.3, cy + s * 0.9);
  ctx.lineTo(cx - s * 0.03, cy + s * 0.26);
  ctx.bezierCurveTo(cx - s * 0.1, cy + s * 0.46, cx - s * 0.36, cy + s * 0.62, cx - s * 0.62, cy + s * 0.36);
  ctx.bezierCurveTo(cx - s * 1.05, cy - s * 0.05, cx - s * 0.55, cy - s * 0.45, cx, cy - s);
  ctx.closePath();
}

function goldGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.35, '#e8c46a');
  g.addColorStop(0.65, '#a8792c');
  g.addColorStop(1, '#fbe3a1');
  return g;
}

/** Draws the table image fitted to the simulation (see IMG), or a plain stand-in until it has loaded. */
export function drawTable(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  ctx.fillStyle = '#05060b';
  ctx.fillRect(0, 0, FULL_W, FULL_H);
  ctx.save();
  ctx.translate(RIM_X, RIM_T);
  if (img && img.complete && img.naturalWidth) {
    const k = img.naturalWidth / IMG.w;
    const x0 = -IMG.left * SX;
    const w = IMG.w * SX;
    // [image y from, image y to] → [table y from, table y to]
    const bands: [number, number, number, number][] = [
      [0, IMG.line - IMG.band, -IMG.top * S_TOP, MID - BAND_U],
      [IMG.line - IMG.band, IMG.line + IMG.band, MID - BAND_U, MID + BAND_U],
      [IMG.line + IMG.band, IMG.h, MID + BAND_U, H + (IMG.h - IMG.bottom) * S_BOT],
    ];
    for (const [a, b, ya, yb] of bands) ctx.drawImage(img, 0, a * k, img.naturalWidth, (b - a) * k, x0, ya, w, yb - ya + 0.5);
  } else {
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, MID);
    ctx.lineTo(W, MID);
    ctx.stroke();
  }
  ctx.restore();
}

/** A sprite image pre-scaled to a disc of radius r (in canvas pixels), or null until the image has loaded. */
export function discSprite(img: HTMLImageElement | null, discRadiusInImage: number, r: number): HTMLCanvasElement | null {
  if (!img || !img.complete || !img.naturalWidth) return null;
  const k = r / discRadiusInImage;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(img.naturalWidth * k));
  c.height = Math.max(2, Math.round(img.naturalHeight * k));
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Where the disc sits inside each sprite (pixels of the 1254 × 1254 images). */
export const SPRITE_DISC = { mallet: 563, puck: 568 };

export interface Sprites {
  red: HTMLCanvasElement | null;
  blue: HTMLCanvasElement | null;
  puck: HTMLCanvasElement | null;
}

function drawSprite(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, unitsPerPixel: number) {
  const w = sprite.width * unitsPerPixel;
  const h = sprite.height * unitsPerPixel;
  ctx.drawImage(sprite, x - w / 2, y - h / 2, w, h);
}

function drawMallet(ctx: CanvasRenderingContext2D, m: Body, color: 'red' | 'blue', sprite: HTMLCanvasElement | null, upp: number) {
  if (sprite) {
    // a soft shadow on the table under the mallet
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + 12, MALLET_R * 0.98, MALLET_R * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSprite(ctx, sprite, m.x, m.y, upp);
    return;
  }
  const [hi, mid, lo] = color === 'red' ? ['#ff8a95', '#e0223b', '#6d0a16'] : ['#9cc8ff', '#2170e0', '#0a2a66'];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  const base = ctx.createRadialGradient(m.x - 20, m.y - 24, 6, m.x, m.y, MALLET_R);
  base.addColorStop(0, hi);
  base.addColorStop(0.55, mid);
  base.addColorStop(1, lo);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // gold ring
  ctx.strokeStyle = goldGradient(ctx, m.x - MALLET_R, m.y - MALLET_R, m.x + MALLET_R, m.y + MALLET_R);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R - 3, 0, Math.PI * 2);
  ctx.stroke();
  // raised knob
  const knob = ctx.createRadialGradient(m.x - 8, m.y - 10, 2, m.x, m.y, 30);
  knob.addColorStop(0, hi);
  knob.addColorStop(1, lo);
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(m.x - 9, m.y - 11, 11, 6, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawPuck(ctx: CanvasRenderingContext2D, p: Body, trail: { x: number; y: number }[], sprite: HTMLCanvasElement | null, upp: number) {
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  const glow = Math.min(1, speed / 1800);
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const a = ((i + 1) / trail.length) * 0.22 * glow;
    ctx.fillStyle = `rgba(255,214,120,${a})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, PUCK_R * (0.55 + (0.45 * (i + 1)) / trail.length), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = glow > 0.05 ? `rgba(255,200,90,${0.35 + glow * 0.5})` : 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12 + glow * 26;
  ctx.fillStyle = '#07070a';
  if (sprite) {
    // the glow while it moves, then the owner's puck on top
    ctx.beginPath();
    ctx.arc(p.x, p.y, PUCK_R * 0.96, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawSprite(ctx, sprite, p.x, p.y, upp);
    return;
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, PUCK_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = goldGradient(ctx, p.x - PUCK_R, p.y - PUCK_R, p.x + PUCK_R, p.y + PUCK_R);
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PUCK_R - 5, 0, Math.PI * 2);
  ctx.stroke();
  // a thin bright edge so the puck stands out on the dark surface
  ctx.strokeStyle = 'rgba(255,240,200,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PUCK_R - 0.5, 0, Math.PI * 2);
  ctx.stroke();
  spadePath(ctx, p.x, p.y + 2, 18);
  ctx.fillStyle = GOLD;
  ctx.fill();
}

export interface Frame {
  puck: Body | null;
  player: Body;
  ai: Body;
  trail: { x: number; y: number }[];
  particles: Particle[];
  /** 0..1 flash of a goal slot (the side that conceded). */
  flash: { side: 'player' | 'ai'; amount: number } | null;
  sprites: Sprites;
}

/** Draws one frame. `layer` is the pre-rendered table at the same scale. */
export function drawFrame(ctx: CanvasRenderingContext2D, layer: CanvasImageSource, scale: number, dpr: number, f: Frame) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(layer, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  const upp = 1 / (scale * dpr);

  ctx.save();
  ctx.translate(RIM_X, RIM_T);
  if (f.flash && f.flash.amount > 0) {
    const y = f.flash.side === 'ai' ? 0 : H;
    const color = f.flash.side === 'ai' ? '47,139,255' : '255,46,77';
    const g = ctx.createRadialGradient(W / 2, y, 10, W / 2, y, 520);
    g.addColorStop(0, `rgba(${color},${0.75 * f.flash.amount})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, f.flash.side === 'ai' ? -RIM_T : H - 520, W, 520 + (f.flash.side === 'ai' ? RIM_T : RIM_B));
  }
  drawMallet(ctx, f.ai, 'blue', f.sprites.blue, upp);
  drawMallet(ctx, f.player, 'red', f.sprites.red, upp);
  if (f.puck) drawPuck(ctx, f.puck, f.trail, f.sprites.puck, upp);
  ctx.globalCompositeOperation = 'lighter';
  for (const p of f.particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color.replace('A', a.toFixed(3));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Sparks where the puck was struck (visual only). */
export function sparks(list: Particle[], x: number, y: number, n: number, palette: string[], speed = 700) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    const max = 0.35 + Math.random() * 0.45;
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color: palette[i % palette.length], size: 5 + Math.random() * 7 });
  }
  if (list.length > 260) list.splice(0, list.length - 260);
}

export function stepParticles(list: Particle[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
}

export const PALETTE = {
  gold: ['rgba(255,226,140,A)', 'rgba(232,196,106,A)', 'rgba(255,248,220,A)'],
  red: ['rgba(255,70,90,A)', 'rgba(255,160,170,A)', 'rgba(232,196,106,A)'],
  blue: ['rgba(70,150,255,A)', 'rgba(170,210,255,A)', 'rgba(232,196,106,A)'],
};
