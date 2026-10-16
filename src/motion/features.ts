// 포즈 랜드마크 → 움직임 특징. 좌표는 '몸 기준'으로 정규화한다:
// 원점 = 어깨 중점, 단위 = 어깨 너비(sw), x는 거울처럼 뒤집고 y는 아래가 +.
// 화면 왼쪽 손(hands[0]) = 사용자의 왼손, 화면 오른쪽 손(hands[1]) = 사용자의 오른손.

export interface Hand {
  on: boolean;
  x: number; y: number;      // 몸 좌표(sw)
  vx: number; vy: number;    // sw/s
  speed: number;
}
export interface Features {
  present: boolean;
  hands: [Hand, Hand];
  head: { x: number; y: number; vx: number; vy: number };
  elbows: [number, number];  // 팔꿈치 굽힘(0 = 펴짐, π = 완전히 접힘)
  span: number;              // 두 손목 거리(sw)
  tilt: number;              // 어깨선 기울기(rad, 화면 오른쪽이 내려가면 +)
  lean: number;              // 상체 기울기(rad)
  torsoX: number;            // 상체 중심의 화면상 좌우 위치(-1..1)
  energy: number;            // 전체 움직임 세기(sw/s, 스무딩)
  sym: number;               // 좌우 대칭 정도 0..1
  still: number;             // 움직이지 않은 시간(s)
}

export interface Landmark { x: number; y: number; visibility?: number }

/** One Euro 필터(1차원) — 느릴 때는 떨림을 강하게 누르고, 빠를 때는 지연을 줄인다. */
class OneEuro {
  private x?: number; private dx = 0;
  constructor(private minCut = 1.0, private beta = 0.5, private dCut = 1.0) {}
  private alpha(cut: number, dt: number) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  f(v: number, dt: number) {
    if (this.x === undefined) { this.x = v; return v; }
    const d = (v - this.x) / dt;
    this.dx += this.alpha(this.dCut, dt) * (d - this.dx);
    const cut = this.minCut + this.beta * Math.abs(this.dx);
    this.x += this.alpha(cut, dt) * (v - this.x);
    return this.x;
  }
  reset() { this.x = undefined; this.dx = 0; }
}

const IDX = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24 };
const USED = Object.values(IDX);

const emptyHand = (): Hand => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0 });

export class FeatureTracker {
  private fx = new Map<number, OneEuro>();
  private fy = new Map<number, OneEuro>();
  private prev: [Hand, Hand] = [emptyHand(), emptyHand()];
  private prevHead = { x: 0, y: 0 };
  private sw = 0;
  private lastT = 0;
  private lost = 0;
  readonly f: Features = {
    present: false, hands: [emptyHand(), emptyHand()], head: { x: 0, y: 0, vx: 0, vy: 0 }, elbows: [0, 0],
    span: 0, tilt: 0, lean: 0, torsoX: 0, energy: 0, sym: 0, still: 0,
  };

  constructor() {
    for (const i of USED) { this.fx.set(i, new OneEuro(1.2, 0.8)); this.fy.set(i, new OneEuro(1.2, 0.8)); }
  }

  /** lm: 정규화 이미지 좌표(0..1), aspect: 영상 가로/세로 */
  update(lm: Landmark[] | null, aspect: number, tMs: number): Features {
    const f = this.f;
    const dt = this.lastT ? Math.min(0.1, Math.max(0.005, (tMs - this.lastT) / 1000)) : 1 / 30;
    this.lastT = tMs;

    const vis = (i: number) => (lm?.[i]?.visibility ?? 1);
    if (!lm || vis(IDX.ls) < 0.5 || vis(IDX.rs) < 0.5) {
      // 잠깐 놓친 프레임은 무시하고, 계속 없으면 정지로 본다
      if (++this.lost > 6) {
        f.present = false; f.energy *= 0.8; f.still += dt;
        for (const h of f.hands) { h.on = false; h.speed = 0; h.vx = h.vy = 0; }
        for (const m of [this.fx, this.fy]) for (const o of m.values()) o.reset();
        this.sw = 0;
      }
      return f;
    }
    this.lost = 0;

    // 거울 좌표 + 가로세로 비 보정 + 필터
    const P = (i: number): [number, number] => [
      this.fx.get(i)!.f((1 - lm[i].x) * aspect, dt),
      this.fy.get(i)!.f(lm[i].y, dt),
    ];
    // 거울 화면에서 사용자의 왼쪽 어깨(11)는 화면 왼쪽에 온다
    const sL = P(IDX.ls), sR = P(IDX.rs);
    const mx = (sL[0] + sR[0]) / 2, my = (sL[1] + sR[1]) / 2;
    const swNow = Math.hypot(sR[0] - sL[0], sR[1] - sL[1]);
    this.sw = this.sw ? this.sw + (swNow - this.sw) * 0.05 : swNow;
    const B = (p: [number, number]): [number, number] => [(p[0] - mx) / this.sw, (p[1] - my) / this.sw];

    f.present = true;
    f.tilt = Math.atan2(sR[1] - sL[1], sR[0] - sL[0]);
    f.torsoX = (mx / aspect - 0.5) * 2;

    if (vis(IDX.lh) > 0.5 && vis(IDX.rh) > 0.5) {
      const hL = P(IDX.lh), hR = P(IDX.rh);
      f.lean = Math.atan2(mx - (hL[0] + hR[0]) / 2, (hL[1] + hR[1]) / 2 - my);
    } else {
      const n = B(P(IDX.nose));
      f.lean = Math.atan2(n[0], 1.2);
    }

    const head = B(P(IDX.nose));
    f.head.vx = lerpV(f.head.vx, (head[0] - this.prevHead.x) / dt);
    f.head.vy = lerpV(f.head.vy, (head[1] - this.prevHead.y) / dt);
    f.head.x = head[0]; f.head.y = head[1];
    this.prevHead = { x: head[0], y: head[1] };

    const arms: [number, number, number][] = [[IDX.ls, IDX.le, IDX.lw], [IDX.rs, IDX.re, IDX.rw]];
    arms.forEach(([si, ei, wi], k) => {
      const h = f.hands[k], p = this.prev[k];
      if (vis(wi) < 0.45) { h.on = false; h.speed *= 0.7; h.vx *= 0.7; h.vy *= 0.7; return; }
      const [x, y] = B(P(wi));
      if (p.on) {
        h.vx = lerpV(h.vx, (x - p.x) / dt);
        h.vy = lerpV(h.vy, (y - p.y) / dt);
      }
      h.on = true; h.x = x; h.y = y;
      h.speed = Math.hypot(h.vx, h.vy);
      this.prev[k] = { ...h };
      const s = B(P(si)), e = B(P(ei));
      const a1 = Math.atan2(s[1] - e[1], s[0] - e[0]), a2 = Math.atan2(y - e[1], x - e[0]);
      let d = Math.abs(a1 - a2); if (d > Math.PI) d = 2 * Math.PI - d;
      f.elbows[k] = Math.PI - d;
    });

    derive(f, dt);
    return f;
  }
}

const lerpV = (a: number, b: number) => a + (b - a) * 0.45;

/** 손 정보로부터 span·대칭·에너지·정지 시간을 계산한다(마우스 모드도 공유). */
export function derive(f: Features, dt: number) {
  const [L, R] = f.hands;
  f.span = L.on && R.on ? Math.hypot(R.x - L.x, R.y - L.y) : 0;
  if (L.on && R.on) {
    const pos = Math.hypot(L.x + R.x, L.y - R.y);
    const vel = Math.hypot(L.vx + R.vx, L.vy - R.vy) / (L.speed + R.speed + 0.3);
    f.sym = Math.max(0, 1 - pos / 1.6) * Math.max(0, 1 - vel);
  } else f.sym = 0;
  const raw = Math.max(L.on ? L.speed : 0, R.on ? R.speed : 0, Math.hypot(f.head.vx, f.head.vy) * 1.5);
  f.energy += (raw - f.energy) * Math.min(1, dt * 8);
  f.still = f.energy < STILL ? f.still + dt : 0;
}

/** 이 속도(sw/s) 아래는 정지로 본다 */
export const STILL = 0.35;
