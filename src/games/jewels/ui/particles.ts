// Particles on one <canvas> over the board (never one DOM node per spark). The animation frame runs only
// while sparks are alive and stops by itself; the total is capped (lower on slow devices, zero with
// reduced motion). dispose() cancels everything.
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export class SparkLayer {
  private sparks: Spark[] = [];
  private frame = 0;
  private last = 0;
  private ctx: CanvasRenderingContext2D | null;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  /** Deterministic jitter (visual only). */
  private seed = 1234567;

  constructor(
    private canvas: HTMLCanvasElement,
    private cap: number
  ) {
    this.ctx = canvas.getContext('2d');
  }

  setCap(cap: number) {
    this.cap = cap;
  }

  resize(width: number, height: number) {
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private rnd() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  get count() {
    return this.sparks.length;
  }

  /** `n` sparks from (x, y) in CSS pixels. Silently trimmed to the cap. */
  burst(x: number, y: number, color: string, n: number, speed = 1) {
    if (!this.ctx || this.cap <= 0) return;
    const room = Math.max(0, this.cap - this.sparks.length);
    for (let i = 0; i < Math.min(n, room); i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = (60 + this.rnd() * 160) * speed;
      const max = 380 + this.rnd() * 260;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: max, max, size: 1.6 + this.rnd() * 2.6, color });
    }
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    const ctx = this.ctx!;
    const dt = Math.min(48, now - this.last);
    this.last = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    const k = dt / 1000;
    let alive = 0;
    for (const s of this.sparks) {
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vy += 420 * k;
      s.vx *= 0.985;
      s.x += s.vx * k;
      s.y += s.vy * k;
      const t = s.life / s.max;
      ctx.globalAlpha = t;
      ctx.fillStyle = s.color;
      const r = s.size * (0.5 + t * 0.5);
      // A small four-point sparkle: two thin diamonds.
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r * 2);
      ctx.lineTo(s.x + r * 0.5, s.y);
      ctx.lineTo(s.x, s.y + r * 2);
      ctx.lineTo(s.x - r * 0.5, s.y);
      ctx.moveTo(s.x - r * 2, s.y);
      ctx.lineTo(s.x, s.y + r * 0.5);
      ctx.lineTo(s.x + r * 2, s.y);
      ctx.lineTo(s.x, s.y - r * 0.5);
      ctx.fill();
      this.sparks[alive++] = s;
    }
    this.sparks.length = alive;
    ctx.globalAlpha = 1;
    this.frame = alive ? requestAnimationFrame(this.tick) : 0;
    if (!alive) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.sparks = [];
  }
}
