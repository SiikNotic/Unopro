// Drawing the table on a canvas. World units are the physics' centimetres; `View` maps them to pixels and can
// turn the table upright for portrait phones. The static table (wood, gold, cloth, pockets) is painted once per
// size into an offscreen canvas; every frame then draws the balls, the guide and the cue on top.
import { BALL_R, CUSHIONS, HEAD_X, POCKETS, TABLE_H, TABLE_W } from '../table';
import type { BallState } from '../physics';
import type { AimGuide } from '../aim';

/** Rail width around the cloth (cm). */
export const RAIL = 15;
export const FULL_W = TABLE_W + RAIL * 2;
export const FULL_H = TABLE_H + RAIL * 2;

export interface View {
  /** Pixels per centimetre. */
  s: number;
  /** Portrait: the table drawn upright (head at the bottom). */
  upright: boolean;
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
}

export function makeView(boxW: number, boxH: number): View {
  const upright = boxH > boxW * 1.05;
  const tw = upright ? FULL_H : FULL_W;
  const th = upright ? FULL_W : FULL_H;
  const s = Math.max(0.5, Math.min(boxW / tw, boxH / th));
  return { s, upright, w: Math.round(tw * s), h: Math.round(th * s) };
}

/** World (cm, cloth origin) → canvas CSS pixels. */
export function toScreen(v: View, x: number, y: number): [number, number] {
  const fx = x + RAIL;
  const fy = y + RAIL;
  return v.upright ? [fy * v.s, (FULL_W - fx) * v.s] : [fx * v.s, fy * v.s];
}

/** Canvas CSS pixels → world. */
export function toWorld(v: View, px: number, py: number): [number, number] {
  if (v.upright) return [FULL_W - py / v.s - RAIL, px / v.s - RAIL];
  return [px / v.s - RAIL, py / v.s - RAIL];
}

/** Applies the view transform so the code below can draw in world units. */
function worldTransform(ctx: CanvasRenderingContext2D, v: View, dpr: number) {
  if (v.upright) ctx.setTransform(0, -v.s * dpr, v.s * dpr, 0, RAIL * v.s * dpr, (FULL_W - RAIL) * v.s * dpr);
  else ctx.setTransform(v.s * dpr, 0, 0, v.s * dpr, RAIL * v.s * dpr, RAIL * v.s * dpr);
}

export const BALL_COLORS: Record<number, string> = {
  1: '#f2b705',
  2: '#1d4fd1',
  3: '#d12b2b',
  4: '#6a2bc4',
  5: '#ef6a12',
  6: '#13804a',
  7: '#7a1b1b',
  8: '#121214',
};
export const ballColor = (id: number) => BALL_COLORS[id > 8 ? id - 8 : id] ?? '#fff';

/** Paints the static table into a canvas of the view's size. */
export function paintTable(v: View, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(v.w * dpr);
  c.height = Math.round(v.h * dpr);
  const ctx = c.getContext('2d')!;
  worldTransform(ctx, v, dpr);
  const W = TABLE_W;
  const H = TABLE_H;
  const R = RAIL;

  // Outer frame: dark wood with a lacquered sheen.
  const wood = ctx.createLinearGradient(0, -R, 0, H + R);
  wood.addColorStop(0, '#5a3418');
  wood.addColorStop(0.18, '#2a170a');
  wood.addColorStop(0.5, '#3b2210');
  wood.addColorStop(0.82, '#24130a');
  wood.addColorStop(1, '#4a2a12');
  roundRect(ctx, -R, -R, W + R * 2, H + R * 2, 7);
  ctx.fillStyle = wood;
  ctx.fill();
  // Gold inlay around the frame and along the inner edge.
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = '#d9a441';
  roundRect(ctx, -R + 1.6, -R + 1.6, W + R * 2 - 3.2, H + R * 2 - 3.2, 6);
  ctx.stroke();
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = 'rgba(255, 215, 106, 0.55)';
  roundRect(ctx, -R + 3, -R + 3, W + R * 2 - 6, H + R * 2 - 6, 5);
  ctx.stroke();

  // Cloth with a soft overhead light.
  const cloth = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.62);
  cloth.addColorStop(0, '#1f8f58');
  cloth.addColorStop(0.55, '#137045');
  cloth.addColorStop(1, '#0a4a2d');
  ctx.fillStyle = cloth;
  ctx.fillRect(-6, -6, W + 12, H + 12);
  // Fine cloth texture: faint diagonal weave.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 0.15;
  for (let i = -H; i < W; i += 1.4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // Cushions: darker green rubber noses following the playing edges.
  ctx.lineCap = 'round';
  for (const seg of CUSHIONS) {
    ctx.strokeStyle = '#0b5534';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(seg.ax + (seg.ax <= 0 ? -1.7 : seg.ax >= W ? 1.7 : 0), seg.ay + (seg.ay <= 0 ? -1.7 : seg.ay >= H ? 1.7 : 0));
    ctx.lineTo(seg.bx + (seg.bx <= 0 ? -1.7 : seg.bx >= W ? 1.7 : 0), seg.by + (seg.by <= 0 ? -1.7 : seg.by >= H ? 1.7 : 0));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(0, 0, W, H);

  // Pockets: deep holes with a gold-plated rim.
  for (const pk of POCKETS) {
    const r = pk.side ? 5.2 : 5.9;
    const hole = ctx.createRadialGradient(pk.x, pk.y, 1, pk.x, pk.y, r);
    hole.addColorStop(0, '#000');
    hole.addColorStop(0.75, '#050505');
    hole.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9952e';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, r + 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 230, 160, 0.6)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, r + 1.2, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  }

  // Diamonds (sights) in gold on the rails.
  ctx.fillStyle = '#e8c46a';
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const x = (W / 8) * i;
    diamond(ctx, x, -R / 2);
    diamond(ctx, x, H + R / 2);
  }
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i;
    diamond(ctx, -R / 2, y);
    diamond(ctx, W + R / 2, y);
  }
  // Head string and foot spot, very faint.
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(HEAD_X, 0);
  ctx.lineTo(HEAD_X, H);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc((W * 3) / 4, H / 2, 0.6, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - 1.1);
  ctx.lineTo(x + 0.75, y);
  ctx.lineTo(x, y + 1.1);
  ctx.lineTo(x - 0.75, y);
  ctx.closePath();
  ctx.fill();
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

export interface Frame {
  balls: BallState[];
  /** Balls falling into a pocket: progress 0–1. */
  falling: { id: number; x: number; y: number; t: number }[];
  guide: AimGuide | null;
  /** Aim direction and power for the cue stick (null: no stick). */
  cue: { dx: number; dy: number; pull: number } | null;
  /** Balls the player may hit first (a soft ring). */
  targets: number[];
  /** The guide meets a ball that isn't a legal first contact. */
  wrongTarget: boolean;
  /** Pocket called for the 8 (gold ring), and whether pockets are selectable. */
  called: number | null;
  calling: boolean;
  /** Ball in hand: cue ball movable, and whether the current spot is legal. */
  inHand: boolean;
  placeOk: boolean;
  kitchen: boolean;
  /** Seconds, for the subtle pulsing of highlights. */
  time: number;
}

export function drawFrame(ctx: CanvasRenderingContext2D, v: View, dpr: number, table: HTMLCanvasElement, f: Frame) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(table, 0, 0);
  worldTransform(ctx, v, dpr);
  const pulse = 0.5 + 0.5 * Math.sin(f.time * 4);

  if (f.kitchen) {
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.55)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(HEAD_X, 0);
    ctx.lineTo(HEAD_X, TABLE_H);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 215, 106, 0.05)';
    ctx.fillRect(0, 0, HEAD_X, TABLE_H);
    ctx.restore();
  }

  // Pocket call for the 8.
  if (f.calling) {
    POCKETS.forEach((pk, i) => {
      ctx.strokeStyle = i === f.called ? `rgba(255, 215, 106, ${0.7 + pulse * 0.3})` : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = i === f.called ? 1.1 : 0.5;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, (pk.side ? 7.4 : 8.4) + (i === f.called ? pulse * 0.8 : 0), 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  // Shadows first, so no ball's shadow falls on another ball.
  for (const b of f.balls) {
    if (b.down) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(b.x + 0.9, b.y + 1.1, BALL_R * 1.02, BALL_R * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The guide.
  const cueBall = f.balls.find((b) => b.id === 0 && !b.down);
  if (f.guide && cueBall) {
    const g = f.guide;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([1.6, 1.4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.42;
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    ctx.lineTo(g.end.x, g.end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Ghost ball.
    ctx.strokeStyle = f.wrongTarget ? 'rgba(255, 90, 90, 0.95)' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(g.end.x, g.end.y, BALL_R, 0, Math.PI * 2);
    ctx.stroke();
    if (g.object && g.hit !== null && !f.wrongTarget) {
      const ob = f.balls.find((b) => b.id === g.hit)!;
      const len = 14 + g.object.fullness * 46;
      const grd = ctx.createLinearGradient(ob.x, ob.y, ob.x + g.object.dx * len, ob.y + g.object.dy * len);
      grd.addColorStop(0, 'rgba(255, 215, 106, 0.95)');
      grd.addColorStop(1, 'rgba(255, 215, 106, 0)');
      ctx.strokeStyle = grd;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(ob.x, ob.y);
      ctx.lineTo(ob.x + g.object.dx * len, ob.y + g.object.dy * len);
      ctx.stroke();
    }
    if (g.after && (g.after.dx || g.after.dy)) {
      const len = g.hit === null ? 18 : 10 + (1 - (g.object?.fullness ?? 0)) * 22;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.moveTo(g.end.x, g.end.y);
      ctx.lineTo(g.end.x + g.after.dx * len, g.end.y + g.after.dy * len);
      ctx.stroke();
    }
    if (g.pocket !== null && !f.wrongTarget) {
      const pk = POCKETS[g.pocket];
      ctx.strokeStyle = `rgba(255, 215, 106, ${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, pk.side ? 6.8 : 7.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Legal targets: a soft ring.
  for (const b of f.balls) {
    if (b.down || !f.targets.includes(b.id)) continue;
    ctx.strokeStyle = `rgba(255, 215, 106, ${0.18 + pulse * 0.22})`;
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R + 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Balls.
  const px = v.s * dpr;
  for (const b of f.balls) if (!b.down) drawBall(ctx, b.id, b.x, b.y, BALL_R, px, v.upright);
  for (const fb of f.falling) {
    const r = BALL_R * (1 - fb.t * 0.65);
    ctx.globalAlpha = 1 - fb.t * 0.8;
    drawBall(ctx, fb.id, fb.x, fb.y, r, px, v.upright);
    ctx.globalAlpha = 1;
  }

  // Ball in hand marker.
  if (f.inHand && cueBall) {
    ctx.strokeStyle = f.placeOk ? `rgba(120, 255, 190, ${0.5 + pulse * 0.5})` : 'rgba(255, 90, 90, 0.95)';
    ctx.lineWidth = 0.55;
    ctx.setLineDash([1.2, 1]);
    ctx.beginPath();
    ctx.arc(cueBall.x, cueBall.y, BALL_R + 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The cue stick, pulled back with the power.
  if (f.cue && cueBall) drawCue(ctx, cueBall.x, cueBall.y, f.cue.dx, f.cue.dy, f.cue.pull);
}

/** One ball: colour, stripe band, number disc, and a glossy highlight. Drawn in world units. */
export function drawBall(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, r: number, pxPerCm: number, upright: boolean) {
  const col = ballColor(id);
  const stripe = id >= 9;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = id === 0 ? '#f7f4ea' : stripe ? '#f4efe2' : col;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (stripe) {
    ctx.fillStyle = col;
    if (upright) ctx.fillRect(x - r * 0.55, y - r, r * 1.1, r * 2);
    else ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
  }
  if (id !== 0 && r * pxPerCm > 5) {
    ctx.fillStyle = '#fbf8ef';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.47, 0, Math.PI * 2);
    ctx.fill();
    if (r * pxPerCm > 7.5) {
      ctx.save();
      ctx.translate(x, y);
      if (upright) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#111';
      ctx.font = `700 ${r * 0.62}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(id), 0, r * 0.04);
      ctx.restore();
    }
  }
  // Light from the top-left of the screen, whatever the orientation.
  const lx = upright ? x + r * 0.42 : x - r * 0.42;
  const ly = y - r * 0.42;
  const shade = ctx.createRadialGradient(lx, ly, r * 0.05, x, y, r * 1.05);
  shade.addColorStop(0, 'rgba(255,255,255,0.9)');
  shade.addColorStop(0.18, 'rgba(255,255,255,0.18)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function drawCue(ctx: CanvasRenderingContext2D, cx: number, cy: number, dx: number, dy: number, pull: number) {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const start = BALL_R + 1.2 + pull;
  const L = 150;
  const tipX = cx - ux * start;
  const tipY = cy - uy * start;
  const buttX = cx - ux * (start + L);
  const buttY = cy - uy * (start + L);
  const nx = -uy;
  const ny = ux;
  const quad = (w0: number, w1: number, a: number, b: number) => {
    const ax = tipX - ux * a;
    const ay = tipY - uy * a;
    const bx = tipX - ux * b;
    const by = tipY - uy * b;
    ctx.beginPath();
    ctx.moveTo(ax + nx * w0, ay + ny * w0);
    ctx.lineTo(bx + nx * w1, by + ny * w1);
    ctx.lineTo(bx - nx * w1, by - ny * w1);
    ctx.lineTo(ax - nx * w0, ay - ny * w0);
    ctx.closePath();
  };
  // Shadow on the cloth.
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.translate(1.6, 2);
  quad(0.7, 1.6, 0, L);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
  // Shaft (maple), forearm and butt (ebony with gold rings).
  const shaft = ctx.createLinearGradient(tipX + nx, tipY + ny, tipX - nx, tipY - ny);
  shaft.addColorStop(0, '#f3dfb4');
  shaft.addColorStop(0.5, '#d9b77e');
  shaft.addColorStop(1, '#a8834f');
  quad(0.62, 0.95, 0, 82);
  ctx.fillStyle = shaft;
  ctx.fill();
  quad(0.95, 1.35, 82, 118);
  ctx.fillStyle = '#2a170b';
  ctx.fill();
  quad(1.35, 1.55, 118, L);
  ctx.fillStyle = '#0d0907';
  ctx.fill();
  for (const at of [82, 118, 146]) {
    quad(1.0 + (at - 82) / 120, 1.05 + (at - 82) / 120, at, at + 1.2);
    ctx.fillStyle = '#e1b04f';
    ctx.fill();
  }
  // Ferrule and tip.
  quad(0.62, 0.64, 0, 2.2);
  ctx.fillStyle = '#f8f5ec';
  ctx.fill();
  quad(0.6, 0.62, -0.6, 0);
  ctx.fillStyle = '#2f6fd1';
  ctx.fill();
  void buttX;
  void buttY;
}
