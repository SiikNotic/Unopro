// A racehorse and its jockey drawn with canvas paths (no images): body, neck and head, four two-segment legs on a
// real gallop rhythm, a waving mane and tail, and the jockey in the horse's silks with its number on the saddlecloth.
// Units: the horse is ~110 units long (nose to tail) and stands on y = 0; `s` is pixels per unit. It faces right.
import type { HorseLook } from '../stable';

export interface Gait {
  /** Stride cycles per second while galloping. */
  freq: number;
  /** Leg swing (radians). */
  swing: number;
  /** Phase offset so horses don't step in unison. */
  offset: number;
  /** Head nod amount. */
  nod: number;
}

/** A small, fixed variation per horse (the same every race). */
export function gaitOf(n: number): Gait {
  const r = (k: number) => ((Math.sin(n * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { freq: 2.05 + r(1) * 0.3, swing: 0.5 + r(2) * 0.12, offset: r(3), nod: 0.8 + r(4) * 0.5 };
}

// Rotary gallop footfall: hind far, hind near, fore far, fore near.
const LEGS = [
  { hind: true, near: false, off: 0 },
  { hind: true, near: true, off: 0.11 },
  { hind: false, near: false, off: 0.42 },
  { hind: false, near: true, off: 0.53 },
];

interface DrawOpts {
  /** Gallop phase, cycles (grows with time while running). */
  phase: number;
  /** 0 standing … 1 full gallop. */
  run: number;
  reduced: boolean;
  gait: Gait;
  mine: boolean;
}

function leg(g: CanvasRenderingContext2D, x: number, y: number, hind: boolean, a: number, bend: number, color: string, hoof: string, sock: boolean) {
  const upper = hind ? 18 : 17;
  const lower = hind ? 20 : 19;
  const kx = x + Math.sin(a) * upper;
  const ky = y + Math.cos(a) * upper;
  const b = hind ? a + bend * 0.7 : a - bend;
  const fx = kx + Math.sin(b) * lower;
  const fy = ky + Math.cos(b) * lower;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = hind ? 8 : 7;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(kx, ky);
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = sock ? '#f2eee6' : color;
  g.beginPath();
  g.moveTo(kx, ky);
  g.lineTo(fx, fy);
  g.stroke();
  g.fillStyle = hoof;
  g.beginPath();
  g.ellipse(fx + 1, fy + 0.5, 3, 2, b, 0, Math.PI * 2);
  g.fill();
}

/** Draws one horse with its jockey at ground point (x, y), `s` pixels per unit. */
export function drawHorse(g: CanvasRenderingContext2D, x: number, y: number, s: number, look: HorseLook, o: DrawOpts) {
  const [base, shade, light, hair] = look.coat;
  const cyc = o.phase * Math.PI * 2;
  const amp = (o.reduced ? 0.55 : 1) * o.run;
  const bob = o.run * (o.reduced ? 1 : 2.6) * Math.pow(Math.sin(cyc), 2);
  const pitch = amp * 0.035 * Math.sin(cyc + 1.1);
  g.save();
  g.translate(x, y);
  g.scale(s, s);

  // shadow on the turf
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(0, 1, 38, 4.5, 0, 0, Math.PI * 2);
  g.fill();

  g.translate(0, -bob);
  g.rotate(pitch);

  const legAngle = (l: (typeof LEGS)[number]) => {
    const p = cyc + (l.off + o.gait.offset) * Math.PI * 2;
    const a = (l.hind ? -0.05 : 0.05) + Math.sin(p) * o.gait.swing * amp;
    const bend = amp * 1.1 * Math.max(0, Math.sin(p + 1.3));
    return { a, bend };
  };

  // far legs (behind the body)
  for (const l of LEGS.filter((q) => !q.near)) {
    const { a, bend } = legAngle(l);
    leg(g, l.hind ? -24 : 24, l.hind ? -38 : -36, l.hind, a, bend + (o.run < 0.1 ? 0.05 : 0), shade, '#161210', false);
  }

  // tail
  const wave = Math.sin(cyc * 1 + 0.6) * amp;
  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(-33, -48);
  g.bezierCurveTo(-46, -50 + wave * 2, -56, -44 + wave * 4, -64, -34 + wave * 6);
  g.bezierCurveTo(-56, -38 + wave * 5, -46, -40 + wave * 3, -34, -42);
  g.closePath();
  g.fill();
  g.strokeStyle = hair;
  g.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(-40, -47 + i);
    g.quadraticCurveTo(-52, -44 + wave * 3 + i * 2, -62 - i * 2, -36 + wave * 6 + i * 3);
    g.stroke();
  }

  // body with a soft top light
  const body = g.createLinearGradient(0, -54, 0, -22);
  body.addColorStop(0, light);
  body.addColorStop(0.45, base);
  body.addColorStop(1, shade);
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(30, -44);
  g.bezierCurveTo(36, -36, 32, -26, 22, -24);
  g.bezierCurveTo(8, -21, -12, -21, -24, -26);
  g.bezierCurveTo(-34, -28, -38, -40, -34, -48);
  g.bezierCurveTo(-28, -54, -10, -52, 4, -50);
  g.bezierCurveTo(16, -49, 26, -50, 30, -44);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,232,190,0.28)';
  g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(-33, -48);
  g.bezierCurveTo(-28, -53.5, -10, -51.5, 4, -49.5);
  g.bezierCurveTo(14, -48.8, 22, -49.5, 27, -47);
  g.stroke();

  // neck and head, nodding with the stride
  const nod = amp * o.gait.nod * 2.2 * Math.sin(cyc - 0.8);
  g.save();
  g.translate(24, -48);
  g.rotate(nod * 0.02);
  g.translate(-24, 48);
  // mane: a waving band along the crest, behind the neck
  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(14, -50);
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const flow = Math.sin(cyc + i * 0.8) * amp * 1.6;
    g.lineTo(14 + t * 27 - 5 - flow, -51 - t * 29 - 3 + flow * 0.4);
  }
  g.lineTo(43, -80);
  g.lineTo(18, -48);
  g.closePath();
  g.fill();
  const neck = g.createLinearGradient(20, -80, 40, -44);
  neck.addColorStop(0, light);
  neck.addColorStop(0.5, base);
  neck.addColorStop(1, shade);
  g.fillStyle = neck;
  g.beginPath();
  g.moveTo(16, -50);
  g.bezierCurveTo(24, -62, 32, -72, 40, -79);
  g.lineTo(46, -78);
  g.bezierCurveTo(52, -72, 58, -66, 61.5, -60);
  g.bezierCurveTo(63, -56.5, 60, -53.5, 56.5, -54);
  g.bezierCurveTo(52, -54.5, 48, -55, 44, -58);
  g.bezierCurveTo(40, -56, 37, -51, 32, -44);
  g.closePath();
  g.fill();
  // ear, eye, nostril, blaze
  g.fillStyle = shade;
  g.beginPath();
  g.moveTo(41, -79);
  g.lineTo(43, -86);
  g.lineTo(46, -79);
  g.closePath();
  g.fill();
  if (look.blaze) {
    g.fillStyle = 'rgba(245,242,235,0.9)';
    g.beginPath();
    g.moveTo(47, -76);
    g.quadraticCurveTo(55, -68, 59, -60);
    g.lineTo(57, -59);
    g.quadraticCurveTo(52, -67, 46, -74);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#0c0a0a';
  g.beginPath();
  g.arc(47.5, -72, 1.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(59, -58.5, 0.9, 0, Math.PI * 2);
  g.fill();
  // bridle: gold cheekpiece and noseband
  g.strokeStyle = 'rgba(232,196,106,0.95)';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(45, -77);
  g.lineTo(52.5, -60.5);
  g.moveTo(49.5, -64.5);
  g.lineTo(60, -61.5);
  g.stroke();
  g.restore();

  // saddlecloth with the number
  g.save();
  g.translate(2, -49);
  g.rotate(-0.04);
  g.fillStyle = look.silk;
  g.strokeStyle = '#e8c46a';
  g.lineWidth = 1.2;
  g.beginPath();
  g.roundRect(-10, 0, 20, 13, 2.5);
  g.fill();
  g.stroke();
  g.fillStyle = look.silk === '#f1e6cf' ? '#1a1208' : '#ffffff';
  g.font = 'bold 10px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(look.n), 0, 7);
  g.restore();

  // jockey (crouched over the withers, rising a little with the stride)
  const jb = o.run * (o.reduced ? 0.4 : 1.2) * Math.sin(cyc * 2 + 0.4);
  g.save();
  g.translate(0, 2 - jb);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // breeches: hip → knee (high, forward) → boot in the stirrup
  g.strokeStyle = '#f4f1ea';
  g.lineWidth = 6.5;
  g.beginPath();
  g.moveTo(-1, -58);
  g.lineTo(11, -58);
  g.lineTo(8, -49);
  g.stroke();
  g.strokeStyle = '#141212';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(8, -49.5);
  g.lineTo(12, -45.5);
  g.stroke();
  // torso in silks
  g.fillStyle = look.silk;
  g.beginPath();
  g.moveTo(-5, -60);
  g.bezierCurveTo(0, -69, 11, -73, 21, -71);
  g.lineTo(23, -64.5);
  g.bezierCurveTo(14, -62, 5, -58, 0, -55);
  g.closePath();
  g.fill();
  // a band of the second colour across the silks
  g.fillStyle = look.silk2;
  g.beginPath();
  g.moveTo(5, -66);
  g.lineTo(13, -69.5);
  g.lineTo(14.5, -66.5);
  g.lineTo(6.5, -63);
  g.closePath();
  g.fill();
  // arm to the reins
  g.strokeStyle = look.silk;
  g.lineWidth = 4.2;
  g.beginPath();
  g.moveTo(17, -69);
  g.lineTo(27, -62.5);
  g.lineTo(34, -60);
  g.stroke();
  // reins to the bit
  g.strokeStyle = '#2a1c14';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(34.5, -60);
  g.lineTo(54, -57);
  g.stroke();
  g.fillStyle = '#e9c3a0';
  g.beginPath();
  g.arc(34.5, -59.8, 1.8, 0, Math.PI * 2);
  g.fill();
  // head and cap with visor
  g.beginPath();
  g.arc(24.5, -74.5, 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = look.silk2;
  g.beginPath();
  g.arc(24, -76, 4.7, Math.PI * 1.0, Math.PI * 2.05);
  g.fill();
  g.beginPath();
  g.ellipse(29, -76.2, 3, 1, 0.1, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // near legs (in front of the body)
  for (const l of LEGS.filter((q) => q.near)) {
    const { a, bend } = legAngle(l);
    leg(g, l.hind ? -24 : 24, l.hind ? -38 : -36, l.hind, a, bend + (o.run < 0.1 ? 0.05 : 0), base, '#1b1512', !!look.socks);
  }
  g.restore();

  // the player's own horse: a gold ring under it
  if (o.mine) {
    g.save();
    g.strokeStyle = 'rgba(243,213,140,0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x, y + s, 42 * s, 6 * s, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}
