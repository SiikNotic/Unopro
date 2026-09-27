// AIR HOCKEY: the table, drawn on a canvas in table units (see table.ts). A black gloss surface in a gold-edged
// metal frame, gold markings, a spade-and-crown centre emblem, red LEDs on the player's side and blue on the AI's,
// lit goal slots, the mallets and the gold-and-black puck. The static parts are drawn once per size into an
// offscreen layer; the moving parts every frame. Purely visual: nothing here decides anything in the match.
import { GOAL_X0, GOAL_X1, H, MALLET_R, MID, PUCK_R, W } from '../table';
import type { Body } from '../engine';

/** The frame around the playing surface, in table units. */
export const RIM = 54;
export const FULL_W = W + RIM * 2;
export const FULL_H = H + RIM * 2;

const RED = '#ff2e4d';
const BLUE = '#2f8bff';
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

function crownPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.45);
  ctx.lineTo(cx - s * 1.05, cy - s * 0.35);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.05);
  ctx.lineTo(cx, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.05);
  ctx.lineTo(cx + s * 1.05, cy - s * 0.35);
  ctx.lineTo(cx + s, cy + s * 0.45);
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

/** Draws the static table (frame, surface, markings, emblem, LED rails, goal slots) in table units. */
export function drawStatic(ctx: CanvasRenderingContext2D) {
  // frame: dark gunmetal with a gold lip
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 40;
  roundRect(ctx, 0, 0, FULL_W, FULL_H, 70);
  const metal = ctx.createLinearGradient(0, 0, FULL_W, FULL_H);
  metal.addColorStop(0, '#2a2d36');
  metal.addColorStop(0.5, '#0d0f15');
  metal.addColorStop(1, '#23262e');
  ctx.fillStyle = metal;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, 6, 6, FULL_W - 12, FULL_H - 12, 64);
  ctx.lineWidth = 7;
  ctx.strokeStyle = goldGradient(ctx, 0, 0, FULL_W, FULL_H);
  ctx.stroke();

  ctx.save();
  ctx.translate(RIM, RIM);

  // LED rails along the inner edge: red on the player's half, blue on the AI's
  const rail = (y0: number, y1: number, color: string) => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-14, y0);
    ctx.lineTo(-14, y1);
    ctx.moveTo(W + 14, y0);
    ctx.lineTo(W + 14, y1);
    ctx.stroke();
    ctx.restore();
  };
  rail(24, MID - 30, BLUE);
  rail(MID + 30, H - 24, RED);
  // end rails beside the goals
  const endRail = (y: number, color: string) => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(GOAL_X0 - 30, y);
    ctx.moveTo(GOAL_X1 + 30, y);
    ctx.lineTo(W - 30, y);
    ctx.stroke();
    ctx.restore();
  };
  endRail(-14, BLUE);
  endRail(H + 14, RED);

  // surface: black gloss, a soft sheen and the air holes
  roundRect(ctx, 0, 0, W, H, 30);
  const surf = ctx.createLinearGradient(0, 0, 0, H);
  surf.addColorStop(0, '#0b1020');
  surf.addColorStop(0.5, '#05060b');
  surf.addColorStop(1, '#140709');
  ctx.fillStyle = surf;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const sheen = ctx.createRadialGradient(W * 0.3, H * 0.25, 20, W * 0.3, H * 0.25, H * 0.7);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 40; y < H; y += 56) for (let x = 40 + ((y / 56) % 2) * 28; x < W; x += 56) ctx.fillRect(x - 2, y - 2, 4, 4);
  // tinted halves
  const tintTop = ctx.createLinearGradient(0, 0, 0, MID);
  tintTop.addColorStop(0, 'rgba(47,139,255,0.10)');
  tintTop.addColorStop(1, 'rgba(47,139,255,0)');
  ctx.fillStyle = tintTop;
  ctx.fillRect(0, 0, W, MID);
  const tintBot = ctx.createLinearGradient(0, H, 0, MID);
  tintBot.addColorStop(0, 'rgba(255,46,77,0.10)');
  tintBot.addColorStop(1, 'rgba(255,46,77,0)');
  ctx.fillStyle = tintBot;
  ctx.fillRect(0, MID, W, MID);
  ctx.restore();

  // gold markings
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.shadowColor = 'rgba(232,196,106,0.6)';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, MID);
  ctx.lineTo(W, MID);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W / 2, MID, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(W / 2, MID, 172, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // goal creases
  ctx.beginPath();
  ctx.arc(W / 2, 0, 230, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H, 230, Math.PI, Math.PI * 2);
  ctx.stroke();
  // faceoff dots
  ctx.fillStyle = GOLD;
  for (const [x, y] of [
    [W * 0.25, H * 0.25],
    [W * 0.75, H * 0.25],
    [W * 0.25, H * 0.75],
    [W * 0.75, H * 0.75],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // centre emblem: crown over a spade, engraved gold
  ctx.save();
  ctx.globalAlpha = 0.9;
  spadePath(ctx, W / 2, MID + 8, 70);
  ctx.fillStyle = goldGradient(ctx, W / 2 - 70, MID - 70, W / 2 + 70, MID + 70);
  ctx.shadowColor = 'rgba(232,196,106,0.55)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  spadePath(ctx, W / 2, MID + 8, 44);
  ctx.fillStyle = '#07080d';
  ctx.fill();
  crownPath(ctx, W / 2, MID - 96, 44);
  ctx.fillStyle = goldGradient(ctx, W / 2 - 44, MID - 130, W / 2 + 44, MID - 70);
  ctx.fill();
  ctx.restore();

  // goal slots
  const slot = (y: number, color: string) => {
    ctx.save();
    ctx.fillStyle = '#000';
    roundRect(ctx, GOAL_X0, y - 16, GOAL_X1 - GOAL_X0, 32, 14);
    ctx.fill();
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  };
  slot(-6, BLUE);
  slot(H + 6, RED);
  ctx.restore();
}

function drawMallet(ctx: CanvasRenderingContext2D, m: Body, color: 'red' | 'blue') {
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

function drawPuck(ctx: CanvasRenderingContext2D, p: Body, trail: { x: number; y: number }[]) {
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
  /** Seconds since start, for the LED breathing. */
  time: number;
}

/** Draws one frame. `layer` is the pre-rendered static table at the same scale. */
export function drawFrame(ctx: CanvasRenderingContext2D, layer: CanvasImageSource, scale: number, dpr: number, f: Frame) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(layer, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

  // LEDs breathing
  const breath = 0.5 + 0.5 * Math.sin(f.time * 2.2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.12 + breath * 0.12;
  ctx.fillStyle = BLUE;
  ctx.fillRect(RIM - 24, RIM, 12, MID);
  ctx.fillRect(RIM + W + 12, RIM, 12, MID);
  ctx.fillStyle = RED;
  ctx.fillRect(RIM - 24, RIM + MID, 12, MID);
  ctx.fillRect(RIM + W + 12, RIM + MID, 12, MID);
  ctx.restore();

  ctx.save();
  ctx.translate(RIM, RIM);
  if (f.flash && f.flash.amount > 0) {
    const y = f.flash.side === 'ai' ? 0 : H;
    const color = f.flash.side === 'ai' ? '47,139,255' : '255,46,77';
    const g = ctx.createRadialGradient(W / 2, y, 10, W / 2, y, 520);
    g.addColorStop(0, `rgba(${color},${0.75 * f.flash.amount})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, f.flash.side === 'ai' ? -RIM : H - 520, W, 520 + RIM);
  }
  drawMallet(ctx, f.ai, 'blue');
  drawMallet(ctx, f.player, 'red');
  if (f.puck) drawPuck(ctx, f.puck, f.trail);
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
