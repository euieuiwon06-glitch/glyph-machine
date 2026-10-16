import { derive, type Features } from './features';

// 카메라를 쓸 수 없을 때의 대체 입력: 마우스를 한쪽 손목처럼 다룬다.
// 포스터 좌표를 몸 좌표(sw)로 바꿔 같은 특징값을 만든다.
export class MouseSource {
  private x = 0; private y = 0; private px?: number; private py?: number;
  private moved = false;
  readonly f: Features = {
    present: true,
    hands: [{ on: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0 }, { on: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0 }],
    head: { x: 0, y: -0.9, vx: 0, vy: 0 }, elbows: [0, 0], span: 0, tilt: 0, lean: 0, torsoX: 0, energy: 0, sym: 0, still: 0,
  };

  constructor(toPoster: (x: number, y: number) => [number, number]) {
    window.addEventListener('pointermove', e => {
      const [x, y] = toPoster(e.clientX, e.clientY);
      this.x = (x - 960) / 150; this.y = (y - 548) / 150 + 0.9; this.moved = true;
    });
  }

  update(dt: number): Features {
    const h = this.f.hands[1];
    if (this.moved) h.on = true;
    if (this.px !== undefined) {
      h.vx += ((this.x - this.px) / dt - h.vx) * 0.45;
      h.vy += ((this.y - this.py!) / dt - h.vy) * 0.45;
    }
    this.px = this.x; this.py = this.y;
    h.x = this.x; h.y = this.y; h.speed = Math.hypot(h.vx, h.vy);
    derive(this.f, dt);
    this.f.span = 0.8 + Math.abs(h.x) * 1.6;
    return this.f;
  }
}
