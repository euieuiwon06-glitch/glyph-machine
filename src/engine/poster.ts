import { BG, H, W, draw, type El } from './elements';

// 누적 캔버스. 화면 캔버스는 지우지 않고 새 요소만 덧그린다.
// 요소 목록을 따로 들고 있어서 리사이즈·저장 때는 처음부터 다시 그린다.
export class Poster {
  readonly els: El[] = [];
  private drawn = 0;
  private ctx: CanvasRenderingContext2D;
  private s = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  /** 화면 좌표(CSS px) → 포스터 좌표 */
  toPoster(x: number, y: number): [number, number] {
    return [(x - this.ox) / this.s, (y - this.oy) / this.s];
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.s = Math.min(w / W, h / H);
    this.ox = (w - W * this.s) / 2;
    this.oy = (h - H * this.s) / 2;
    this.redraw();
  }

  add(e: El) { this.els.push(e); }

  clear() { this.els.length = 0; this.redraw(); }

  /** 아직 그리지 않은 요소만 덧그린다 */
  flush() {
    if (this.drawn >= this.els.length) return;
    const c = this.ctx;
    c.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, this.dpr * this.ox, this.dpr * this.oy);
    for (; this.drawn < this.els.length; this.drawn++) draw(c, this.els[this.drawn]);
  }

  redraw() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = BG;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawn = 0;
    this.flush();
  }

  /** 3840×2160으로 다시 렌더링한 PNG */
  async exportPNG(scale = 2): Promise<Blob> {
    const cv = document.createElement('canvas');
    cv.width = W * scale; cv.height = H * scale;
    const c = cv.getContext('2d', { alpha: false })!;
    c.fillStyle = BG;
    c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(scale, 0, 0, scale, 0, 0);
    for (const e of this.els) draw(c, e);
    return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }
}
