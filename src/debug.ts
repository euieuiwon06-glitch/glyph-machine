import type { Features } from './motion/features';

// 개발용 디버그 패널(?debug). 카메라 영상 없이 몸 좌표와 특징값만 보여준다.
export class DebugPanel {
  private cv = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  constructor() {
    Object.assign(this.cv.style, { position: 'fixed', left: '12px', top: '12px', width: '280px', height: '330px', background: 'rgba(255,255,255,.92)', border: '1px solid #ddd', pointerEvents: 'none', zIndex: '10' });
    this.cv.width = 560; this.cv.height = 660;
    document.body.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d')!;
  }
  draw(f: Features, stats: Record<string, number>, mode: string) {
    const c = this.ctx;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, 280, 330);
    // 몸 좌표 미리보기: 1 sw = 22px, 어깨 중점 = (140, 70)
    const P = (x: number, y: number): [number, number] => [140 + x * 22, 70 + y * 22];
    c.strokeStyle = '#B5B5B5'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(...P(-0.5, 0)); c.lineTo(...P(0.5, 0)); c.stroke();
    c.fillStyle = '#111';
    const dot = (x: number, y: number, r = 3) => { const [a, b] = P(x, y); c.beginPath(); c.arc(a, b, r, 0, 7); c.fill(); };
    dot(f.head.x, f.head.y, 4); dot(-0.5, 0); dot(0.5, 0);
    f.hands.forEach(h => {
      if (!h.on) return;
      dot(h.x, h.y, 4);
      const [a, b] = P(h.x, h.y);
      c.strokeStyle = '#555'; c.beginPath(); c.moveTo(a, b); c.lineTo(a + h.vx * 6, b + h.vy * 6); c.stroke();
    });
    c.font = '10px ui-monospace, monospace'; c.fillStyle = '#333';
    const n = (v: number) => v.toFixed(2);
    const hand = (i: 0 | 1) => { const h = f.hands[i]; return h.on ? `${n(h.x)},${n(h.y)} v${n(h.speed)}` : '-'; };
    const rows = [
      `mode ${mode}  present ${f.present}`,
      `energy ${n(f.energy)}  still ${n(f.still)}s`,
      `span ${n(f.span)}  sym ${n(f.sym)}`,
      `tilt ${n(f.tilt)}  lean ${n(f.lean)}`,
      `L ${hand(0)}`,
      `R ${hand(1)}`,
      `elbow ${n(f.elbows[0])} / ${n(f.elbows[1])}`,
      ...Object.entries(stats).map(([k, v]) => `${k} ${Number.isInteger(v) ? v : n(v)}`),
    ];
    rows.forEach((r, i) => c.fillText(r, 10, 150 + i * 12.5));
  }
}
