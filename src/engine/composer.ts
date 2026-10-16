import { rng, type El, type Ink } from './elements';
import type { Features, Hand } from '../motion/features';
import { STILL } from '../motion/features';
import { clamp, lerp } from './grammar';

// 움직임 → 조형. 손이 움직이는 그 순간, 그 자리에 바로 그린다.
//
//  손이 지나가는 길       → 그 자리에 가는 선 묶음이 실시간으로 따라 그려진다.
//                          묶음은 일정 거리마다 한 점으로 모였다 다시 퍼진다(렌즈가 이어지는 모양).
//  선이 모이는 지점마다   → 작은 문양 하나가 무작위로 찍힌다
//                          (작은 초승달 · 동심 원호 · 점선 고리 · 십자 노드 · 방사선 다발 · 점 줄 · 반원 면)
//  크게 휘두르는 원호     → 그 원을 따라 굵은 초승달 면(드물게)
//  빠르고 곧은 휘두름     → 칼날 면(드물게)
//  속도                  → 선 수·진하기, 옆을 따라가는 점 사슬, 입자 구름, 문양 크기
//  크게 위아래·좌우 휘두름 → 수직·수평 헤어라인
//  양팔 벌림              → 전체 크기·선 묶음 폭, 바깥 점선 원호
//  몸·어깨 기울임         → 좌표계 회전, 선 묶음 비대칭
//  고개 끄덕임            → 점 기둥
//  멈춤                  → 바로 생성 중단(수렴점에 점이 최대 3개 찍히고 끝)

const CX = 960, CY = 540;
const STEP = 26;                 // 이 거리(px)마다 선 묶음 한 조각
const MAX_SEGS = 36000;          // 선 조각 상한
const COMPLETE_NIB = 600;
const MAX_FILLS = 110, MAX_BARS = 90, MAX_NIB = 900;
const MAX_HEAVY = 4, MAX_BLADES = 2, MAX_MOTIFS = 130, MAX_BLACK_MOTIFS = 14, MAX_BEADS = 150, MAX_STIP = 7000, MAX_HAIR = 20, MAX_RINGS = 7;
const GRID = 40, GW = 48, GH = 27;
const OCC_SOFT = 160, OCC_HARD = 380;

type V = [number, number];
interface Circle { x: number; y: number; r: number }
interface LineSpec { o: number; wob: number; ph: number; c: Ink; a: number; lw: number; dot?: number }
interface Stroke {
  pts: V[]; d: number[];      // 샘플 점과 누적 거리
  lines: LineSpec[];
  period: number; phase: number; spread: number;
  r: () => number;
  nextPinch: number;          // 다음 수렴 지점의 누적 거리
  nextBead: number;
  win: V[];                   // 초승달 판정용 최근 구간
  box: [number, number, number, number];
  idle: number;
  run: { start: number; end: number; rMax: number; side: number } | null;
  // 펜촉 획: 납작한 펜촉(각도·폭)으로 곧은 마디를 이어 각지게 쓴다
  nib: { ang: number; w: number };
  vA: V; vPrev: V | null; segDir: V | null;
  // 펜을 내렸다 들었다: 쓰는 구간의 궤적을 축소해 시작 자리에 작은 글리프로 쓴다
  pen: { start: V; anchor: V; scale: number; end: number; at: V; prev: V | null } | null;
  penNext: number;
}
export interface Frame { rot: number; k: number }

export class Composer {
  paused = false;
  /** 그림이 다 그려졌으면 true(생성을 멈춘다) */
  done = false;
  frame: Frame = { rot: 0, k: 1 };
  private strokes: (Stroke | null)[] = [null, null];
  private seedN = 0;
  private heavy: Circle[] = [];
  private pinches: V[] = [];
  private occ = new Float32Array(GW * GH);
  private n = { segs: 0, nib: 0, fills: 0, bars: 0, motifs: 0, black: 0, blades: 0, beads: 0, stip: 0, hair: 0, rings: 0, hatch: 0 };
  private lastHeavyT = -99;
  private lastBladeT = -99;
  private t = 0;
  private bias: V = [0, 0];
  private biasT = 0;
  private inkErr: V = [0, 0];
  private ink = [0, 0, 0]; // 그려진 선의 무게중심 누적(x합, y합, 무게)
  private spanArmed = true;
  private col: { x: number; y: number; i: number } | null = null;
  private colAcc = 0;
  private stillDots = 0;
  private stillAcc = 0;
  private dotted = new Set<number>();

  private add: (e: El) => void;
  constructor(private out: (e: El) => void) {
    // 그려지는 모든 요소의 '시각적 무게'를 모아 무게중심을 잰다(검은 면일수록 무겁게)
    this.add = e => { this.weigh(e); out(e); };
  }

  private weigh(e: El) {
    let x = 0, y = 0, w = 0;
    switch (e.k) {
      case 'bowl': x = e.cx; y = e.cy; w = e.ry * e.ry * 0.05; break;
      case 'blade': x = (e.x0 + e.x1) / 2; y = (e.y0 + e.y1) / 2; w = 25; break;
      case 'dot': x = e.x; y = e.y; w = e.r * e.r * 0.4; break;
      case 'stip': x = e.x; y = e.y; w = e.n * 0.02; break;
      case 'poly': { const n = e.p.length; x = (e.p[0] + e.p[n - 2]) / 2; y = (e.p[1] + e.p[n - 1]) / 2; w = e.a * 2; break; }
      case 'line': x = (e.x0 + e.x1) / 2; y = (e.y0 + e.y1) / 2; w = 1; break;
      case 'ell': x = e.cx; y = e.cy; w = 1; break;
      case 'arcs': x = e.cx; y = e.cy; w = 8; break;
      case 'fill': { const n = e.p.length / 2; for (let i = 0; i < e.p.length; i += 2) { x += e.p[i] / n; y += e.p[i + 1] / n; } w = 6; break; }
      case 'bars': { x = (e.segs[0] + e.segs[e.segs.length - 1]) / 2; y = e.y; w = e.segs.length * 0.6; break; }
      default: return;
    }
    this.ink[0] += x * w; this.ink[1] += y * w; this.ink[2] += w;
  }

  /** 모든 누적 상태를 처음으로(일시정지 여부는 유지) */
  reset() {
    const paused = this.paused;
    Object.assign(this, new Composer(this.out));
    this.paused = paused;
  }

  update(f: Features, dt: number) {
    if (this.paused || this.done || !f.present) return;
    // 완성: 펜촉 획이 충분히 쌓이면(계속 움직여 약 2~3분) 생성을 멈춘다
    if (this.n.nib >= COMPLETE_NIB || this.n.segs >= MAX_SEGS) { this.done = true; return; }
    this.t += dt;
    const a = Math.min(1, dt * 3);
    this.frame.rot += (clamp(f.tilt * 0.8 + f.lean * 0.5, -0.35, 0.35) - this.frame.rot) * a;
    if (f.span > 0) this.frame.k += (lerp(0.85, 1.12, clamp((f.span - 1) / 2.8)) - this.frame.k) * a;

    // 그려진 그림의 무게중심이 한쪽으로 쏠리면 다음 그림을 반대쪽으로 조금씩 옮긴다
    if (this.ink[2] > 40) {
      this.inkErr[0] = clamp(this.ink[0] / this.ink[2] - CX, -220, 220);
      this.inkErr[1] = clamp(this.ink[1] / this.ink[2] - CY, -220, 220);
    }
    f.hands.forEach((h, i) => this.hand(h, i, f, dt));

    if (f.energy < STILL) { this.onStill(f, dt); return; }
    this.stillDots = 0; this.stillAcc = 0;
    this.onBody(f, dt);
  }

  // ── 손 하나: 움직이는 동안 매 조각을 바로 그린다 ─────────────────
  private hand(h: Hand, i: number, f: Features, dt: number) {
    const moving = h.on && h.speed > STILL;
    let st = this.strokes[i];
    if (!moving) {
      if (st && (st.idle += dt) > 0.18) { this.endStroke(st); this.strokes[i] = null; }
      return;
    }
    const fast = clamp((h.speed - 0.6) / 3.2);
    this.track(h, dt);
    const p = this.map(h.x, h.y);
    if (!st) st = this.strokes[i] = this.newStroke(p, fast, f, i);
    st.idle = 0;
    const last = st.pts[st.pts.length - 1];
    const step = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (step < STEP) return;
    // 아주 빠르면 한 프레임에 여러 조각
    const n = Math.min(4, Math.floor(step / STEP));
    for (let k = 1; k <= n; k++) {
      const q: V = [lerp(last[0], p[0], k / n), lerp(last[1], p[1], k / n)];
      st.pts.push(q);
      st.d.push(st.d[st.d.length - 1] + step / n);
      this.grow(st, fast);
    }
  }

  /** 움직이는 손의 (보정 전) 평균 위치를 따라간다. 처음 몇 초는 빨리, 이후엔 천천히. */
  private track(h: Hand, dt: number) {
    const k = this.frame.k, c = Math.cos(this.frame.rot), s = Math.sin(this.frame.rot);
    const dy = h.y - 0.3;
    const x0 = h.x * 340 * k, y0 = dy * (dy > 0 ? 400 : 300) * k;
    const x = x0 * c - y0 * s, y = x0 * s + y0 * c;
    this.biasT += dt;
    const a = dt / clamp(this.biasT, 0.8, 12);
    this.bias[0] += (clamp(x, -500, 500) - this.bias[0]) * a * 0.6;
    this.bias[1] += (clamp(y, -400, 400) - this.bias[1]) * a;
    this.bias[0] = clamp(this.bias[0], -260, 260);
    this.bias[1] = clamp(this.bias[1], -320, 320);
  }

  private newStroke(p: V, fast: number, f: Features, hand: number): Stroke {
    const r = rng((this.seedN++ * 2654435761 + 99) >>> 0);
    // 가는 선은 펜촉 획 옆을 따라가는 0~2가닥만
    const count = r() < 0.45 ? 0 : r() < 0.6 ? 1 : 2;
    const skew = clamp(f.lean * 1.5 + (hand ? 0.1 : -0.1), -0.35, 0.35);
    const lines: LineSpec[] = [];
    for (let l = 0; l < count; l++) {
      const dotted = r() < 0.07;
      lines.push({
        o: ((count === 1 ? 0.5 : l / (count - 1)) - 0.5 + skew) * 2 * (0.85 + r() * 0.3),
        wob: r() * 5, ph: r() * 6.28,
        c: (r() < 0.22 ? 1 : 0) as Ink,
        a: dotted ? 0.75 : 0.7 + r() * 0.6,
        lw: dotted ? 1.3 : r() < 0.08 ? 1.6 : 1,
        dot: dotted ? 4 + r() * 3 : undefined,
      });
    }
    const period = lerp(220, 420, r());
    return {
      pts: [p], d: [0], lines, period, phase: r() < 0.5 ? 0 : 0.5,
      spread: lerp(58, 30, fast) * lerp(0.8, 1.35, clamp((f.span - 1) / 3)) * (0.75 + r() * 0.5),
      r, nextPinch: 0, nextBead: 0, win: [p], box: [p[0], p[1], p[0], p[1]], idle: 0, run: null,
      nib: { ang: [-0.65, 0.65, 0.95, -0.95][Math.floor(r() * 4)] + (r() - 0.5) * 0.2, w: lerp(6, 11, fast) * this.frame.k * (0.8 + r() * 0.4) }, vA: p, vPrev: null, segDir: null, pen: null, penNext: 0,
    };
  }

  /** 새 샘플이 생길 때마다: 선 조각 · 수렴 지점의 문양 · 점 사슬 · 초승달 판정 */
  private grow(st: Stroke, fast: number) {
    const P = st.pts, N = P.length;
    const cur = P[N - 1];
    st.box = [Math.min(st.box[0], cur[0]), Math.min(st.box[1], cur[1]), Math.max(st.box[2], cur[0]), Math.max(st.box[3], cur[1])];
    st.win.push(cur);
    while (st.win.length > 2 && polyLen(st.win) > 330) st.win.shift();

    // 0) 펜촉 획: 펜을 내린 구간에서만, 방향이 꺾이거나 마디가 길어지면 그 마디를 바로 그린다
    const dNow = st.d[N - 1];
    if (!st.pen && dNow >= st.penNext && this.n.nib < MAX_NIB) {
      const r = st.r;
      st.pen = { start: cur, anchor: cur, scale: lerp(0.3, 0.5, r()), end: dNow + lerp(280, 620, r()), at: cur, prev: null };
      st.vA = cur; st.vPrev = null; st.segDir = null;
    } else if (st.pen && dNow > st.pen.end) {
      if (dist(st.vA, cur) > 12) this.nibSeg(st, st.vA, cur, fast);
      st.pen = null; st.penNext = dNow + lerp(180, 520, st.r());
    }
    if (st.pen && N >= 2) {
      if (!st.segDir) {
        if (dist(st.vA, cur) > 22) st.segDir = unit(cur[0] - st.vA[0], cur[1] - st.vA[1]);
      } else {
        const dir = unit(cur[0] - P[N - 2][0], cur[1] - P[N - 2][1]);
        const turn = Math.acos(clamp(dir[0] * st.segDir[0] + dir[1] * st.segDir[1], -1, 1));
        if (turn > 0.5) { this.nibSeg(st, st.vA, P[N - 2], fast); st.vPrev = st.vA; st.vA = P[N - 2]; st.segDir = dir; }
        else if (dist(st.vA, cur) > 170) { this.nibSeg(st, st.vA, cur, fast); st.vPrev = st.vA; st.vA = cur; st.segDir = null; }
      }
    }

    // 1) 선 조각: 한 칸 늦게(다음 점을 알아야 곡선이 부드럽다) P[N-3]→P[N-2]
    if (N >= 3 && this.n.segs < MAX_SEGS) {
      const i1 = N - 3, i2 = N - 2;
      const p0 = P[Math.max(0, i1 - 1)], p1 = P[i1], p2 = P[i2], p3 = P[N - 1];
      const occ = this.occ[this.cell(p2)] ?? 0;
      if (occ < OCC_HARD) {
        const dim = occ > OCC_SOFT ? 0.45 : 1;
        const active = st.lines.length;
        const sub = 4;
        const seg: V[] = [], tan: V[] = [];
        for (let j = 0; j <= sub; j++) {
          const t = j / sub;
          seg.push(cr(p0, p1, p2, p3, t));
          tan.push(crd(p0, p1, p2, p3, t));
        }
        const d1 = st.d[i1], d2 = st.d[i2];
        for (let l = 0; l < active; l++) {
          const L = st.lines[l];
          const out: number[] = [];
          for (let j = 0; j <= sub; j++) {
            const dd = lerp(d1, d2, j / sub);
            const w = this.width(st, dd);
            const off = (L.o * st.spread + L.wob * Math.sin(dd / 60 + L.ph)) * w;
            const [tx, ty] = tan[j], tl = Math.hypot(tx, ty) || 1;
            out.push(r1(seg[j][0] - (ty / tl) * off), r1(seg[j][1] + (tx / tl) * off));
          }
          this.add({ k: 'poly', p: out, lw: L.lw * lerp(0.4, 0.62, fast), c: L.c, a: Math.min(0.6, L.a * lerp(0.15, 0.35, fast) * dim), fi: 0, fo: 0, dot: L.dot });
          this.n.segs++;
        }
        const c = this.cell(p2); if (c >= 0) this.occ[c] += active;
      }
    }

    // 2) 묶음이 한 점으로 모이는 지점 → 그 자리에 문양
    const d = st.d[N - 1];
    if (d >= st.nextPinch) {
      st.nextPinch = this.pinchAfter(st, d);
      if (d > 10) this.motif(cur, P[Math.max(0, N - 3)], fast, st.r);
      // 점 줄은 드물게 시작한다
      if (!st.run || d > st.run.end) st.run = fast > 0.3 && st.r() < 0.22 ? { start: d, end: d + st.period * lerp(0.6, 1.2, st.r()), rMax: lerp(2.5, 9, st.r()), side: st.r() < 0.5 ? 1 : -1 } : null;
    }

    // 3) 가끔 묶음 옆을 따라 점 줄 하나: 아주 작은 점 → 큰 점 → 아주 작은 점
    const run = st.run;
    if (run && d <= run.end && d >= st.nextBead && this.n.beads < MAX_BEADS && N >= 2) {
      const prev = P[N - 2], tx = cur[0] - prev[0], ty = cur[1] - prev[1], tl = Math.hypot(tx, ty) || 1;
      const env = Math.sin(Math.PI * clamp((d - run.start) / (run.end - run.start)));
      const rad = 0.5 + run.rMax * Math.pow(env, 2.2);
      const off = (st.spread * 1.1 + 16) * run.side;
      this.add({ k: 'dot', x: cur[0] - (ty / tl) * off, y: cur[1] + (tx / tl) * off, r: rad, c: 0, a: 0.95 });
      this.n.beads++;
      st.nextBead = d + rad * 2.6 + 6;
    }

    // 4) 최근 구간이 크게 휘었으면 굵은 초승달 / 빠르고 곧으면 칼날
    if (st.win.length >= 8) {
      const turn = totalTurn(st.win), len = polyLen(st.win);
      if (Math.abs(turn) > 1.7 && fast > 0.2 && this.t - this.lastHeavyT > 2.5) { this.crescent(st.win, turn, fast, st.r); st.win = [cur]; }
      else if (len > 280 && dist(st.win[0], cur) / len > 0.93 && fast > 0.55 && this.n.blades < MAX_BLADES && this.t - this.lastBladeT > 6) {
        this.lastBladeT = this.t; this.blade(st.win, fast); st.win = [cur];
      }
    }
  }

  /** 펜촉 마디 A→B: 납작한 펜촉이 지나간 평행사변형. 펜촉과 수직으로 움직이면 굵고, 나란하면 가늘다. */
  private nibSeg(st: Stroke, rA: V, rB: V, fast: number) {
    const pen = st.pen;
    if (!pen) return;
    // 손이 그은 마디를 축소하고, 방향은 22.5° 단위로 맞춰 또렷하게 각지게 이어 쓴다
    const len = dist(rA, rB) * pen.scale;
    if (len < 4) return;
    const step = Math.PI / 8;
    const a0 = Math.round(Math.atan2(rB[1] - rA[1], rB[0] - rA[0]) / step) * step;
    const A = pen.at, B: V = [A[0] + Math.cos(a0) * len, A[1] + Math.sin(a0) * len];
    const V0 = pen.prev;
    pen.prev = A; pen.at = B;
    const c = this.cell(B);
    if (c >= 0 && this.occ[c] > OCC_HARD) return;
    const w = st.nib.w * lerp(0.85, 1.15, fast);
    const nx = Math.cos(st.nib.ang) * w / 2, ny = Math.sin(st.nib.ang) * w / 2;
    this.add({ k: 'fill', p: [A[0] - nx, A[1] - ny, A[0] + nx, A[1] + ny, B[0] + nx, B[1] + ny, B[0] - nx, B[1] - ny].map(r1), c: 0, a: 1 });
    this.n.nib++;
    if (c >= 0) this.occ[c] += 6;

    // 뾰족하게 되접히는 지그재그 → 그 사이를 삼각 면으로 채운다
    if (V0 && this.n.fills < MAX_FILLS) {
      const d1 = unit(A[0] - V0[0], A[1] - V0[1]), d2 = unit(B[0] - A[0], B[1] - A[1]);
      const turn = Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
      if (turn > 1.7 && dist(V0, A) < 80 && len < 80 && st.r() < 0.8) {
        this.add({ k: 'fill', p: [V0[0], V0[1], A[0], A[1], B[0], B[1]].map(r1), c: 0, a: 1 });
        this.n.fills++;
      }
    }

    // 가로로 빠르게 그은 마디 → 길이가 제각각인 가로 막대 줄이 층층이
    const ang = Math.abs(Math.atan2(B[1] - A[1], B[0] - A[0]));
    if ((ang < 0.3 || ang > Math.PI - 0.3) && len > 35 && fast > 0.25 && this.n.bars < MAX_BARS) {
      const r = st.r, dir = B[0] >= A[0] ? 1 : -1;
      const ext = lerp(80, 220, r());
      const x0 = Math.min(A[0], B[0]) - (dir > 0 ? 40 : ext), x1 = Math.max(A[0], B[0]) + (dir > 0 ? ext : 40);
      const rows = 2 + Math.floor(r() * lerp(2, 6, fast));
      const y0 = Math.round(((A[1] + B[1]) / 2) / 9) * 9 + (r() < 0.5 ? 14 : -14 - rows * 9);
      for (let k = 0; k < rows && this.n.bars < MAX_BARS; k++) {
        const segs: number[] = [];
        let x = x0 + r() * 30;
        while (x < x1) {
          // 진행 방향 끝으로 갈수록 막대가 짧고 듬성해진다
          const u = dir > 0 ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0);
          const L = lerp(90, 6, Math.pow(u, 0.8)) * (0.3 + r() * 0.9);
          if (r() > u * 0.55) segs.push(r1(x), r1(Math.min(x1, x + L)));
          x += L + lerp(3, 26, u) * (0.5 + r());
        }
        if (segs.length) { this.add({ k: 'bars', y: y0 + k * 9, segs, h: lerp(3, 5, r()), c: 0, a: 1 }); this.n.bars++; }
      }
    }
  }


  /** 거리 d에서 선 묶음의 폭(0 = 한 점으로 모임) */
  private width(st: Stroke, d: number) {
    const s = d / st.period + st.phase;
    return Math.pow(Math.abs(Math.sin(Math.PI * s)), 0.85);
  }
  private pinchAfter(st: Stroke, d: number) {
    const k = Math.floor(d / st.period + st.phase) + 1;
    return (k - st.phase) * st.period;
  }

  private endStroke(st: Stroke) {
    const last = st.pts[st.pts.length - 1];
    if (st.pen && dist(st.vA, last) > 12) this.nibSeg(st, st.vA, last, 0.3);
    // 크게 위아래/좌우로 휘두른 획 → 헤어라인
    if (this.n.hair >= MAX_HAIR) return;
    const [x0, y0, x1, y1] = st.box, w = x1 - x0, h = y1 - y0;
    const snap = (v: number) => Math.round(v / 12) * 12;
    if (h > 170 && h > w * 2.2) {
      const x = snap((x0 + x1) / 2);
      this.add({ k: 'line', x0: x, y0: y0 - 20, x1: x, y1: y1 + 20, lw: 0.6, c: 0, a: 0.75, ends: this.n.hair % 3 === 0 ? 1.6 : 0 });
      this.n.hair++;
    } else if (w > 220 && w > h * 2.2) {
      const y = snap((y0 + y1) / 2);
      this.add({ k: 'line', x0: x0 - 30, y0: y, x1: x1 + 30, y1: y, lw: 0.7, c: 0, a: 0.8, ends: 2 });
      this.n.hair++;
    }
  }

  /** 몸 좌표(sw) → 포스터 좌표. 회전·크기를 적용하고 가장자리는 부드럽게 눌러 여백을 지킨다. */
  private map(bx: number, by: number): V {
    const k = this.frame.k, c = Math.cos(this.frame.rot), s = Math.sin(this.frame.rot);
    // 손목은 카메라 아래로 잘 내려가지 않으므로 기준을 낮추고, 어깨 아래쪽 움직임은 더 크게 늘린다
    const dy = by - 0.3;
    const x0 = bx * 340 * k, y0 = dy * (dy > 0 ? 400 : 300) * k;
    let x = x0 * c - y0 * s, y = x0 * s + y0 * c;
    // 자동 중심 맞춤: 손이 주로 움직이는 범위의 평균이 화면 정중앙에 오도록 기준을 옮긴다
    x -= this.bias[0] + this.inkErr[0] * 0.9; y -= this.bias[1] + this.inkErr[1] * 0.9;
    // 가장자리 근처에서만 부드럽게 눌러 여백을 지킨다(가운데는 거의 1:1)
    const ex = x / 900, ey = y / 520, r = Math.hypot(ex, ey);
    const m = r > 1e-6 ? Math.tanh(r) / r : 1;
    return [CX + x * m, CY + y * m];
  }

  // ── 작은 문양 ──────────────────────────────────────────
  private motif(p: V, back: V, fast: number, r: () => number) {
    this.pinches.push(p);
    if (this.pinches.length > 40) this.pinches.shift();
    if (fast > 0.45 && this.n.stip < MAX_STIP && r() < 0.6) {
      const n = Math.round(lerp(60, 220, fast));
      this.n.stip += n;
      this.add({ k: 'stip', x: p[0], y: p[1], ang: Math.atan2(back[1] - p[1], back[0] - p[0]), len: lerp(50, 120, fast), wid: lerp(10, 22, fast), n, r: 0.7, seed: (this.seedN * 31 + this.n.motifs) >>> 0, c: 0, a: 0.8 });
    }
    if (this.n.motifs >= MAX_MOTIFS || r() < 0.4) return;
    this.n.motifs++;
    const s = lerp(0.75, 1.4, fast) * (0.7 + r() * 0.6);
    const ang = r() * Math.PI * 2;
    // 절반쯤은 손 경로에서 비켜난 자리에 놓아 화면 전체로 흩어지게
    let x = p[0], y = p[1];
    if (r() < 0.6) { const a = r() * Math.PI * 2, L = lerp(80, 320, r()); x += Math.cos(a) * L; y += Math.sin(a) * L * 0.9; }
    x = clamp(x, 90, 1830); y = clamp(y, 70, 1010);
    const ortho = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4); // 0·45·90° 계열
    const ln = (x0: number, y0: number, x1: number, y1: number, a = 0.8, lw = 0.6) => this.add({ k: 'line', x0, y0, x1, y1, lw, c: 0, a });
    const ring = (R: number, t0 = 0, t1 = Math.PI * 2, a = 0.8, lw = 0.7, dot = 0) => this.add({ k: 'ell', cx: x, cy: y, rx: R, ry: R, rot: 0, t0, t1, lw, c: 0, a, dot });

    let kind = Math.floor(r() * 16);
    // 검은 면 문양(작은 초승달·사분 면·쐐기)은 아껴 쓴다
    if ((kind === 0 || kind === 6 || kind === 15) && this.n.black++ >= MAX_BLACK_MOTIFS) kind = 7 + Math.floor(r() * 8);
    switch (kind) {
      case 0: { // 작은 초승달
        const R = 18 * s + r() * 12, ext = lerp(1.4, 2.8, r());
        this.add({ k: 'bowl', cx: x, cy: y, rot: ang, ry: R, rxO: R, rxI: R * lerp(0.55, 0.75, r()), t0: -ext / 2, t1: ext / 2, c: 0 });
        break;
      }
      case 1: { // 동심 원호
        const R = 18 * s, ext = lerp(1.2, 3.2, r());
        for (let k = 0; k < 3 + Math.floor(r() * 5); k++) ring(R + k * 5, ang, ang + ext, 0.75 - k * 0.07, 0.6);
        break;
      }
      case 2: // 점선 고리
        ring(lerp(26, 70, r()) * s, ang, ang + Math.PI * lerp(1.1, 2, r()), 0.7, 1.2, 4 + r() * 2);
        break;
      case 3: // 십자 노드
        this.add({ k: 'cross', x, y, s: 7 * s, lw: 0.8, c: 0, a: 0.9 });
        ring(11 * s, 0, Math.PI * 2, 0.8, 0.7);
        this.add({ k: 'dot', x, y, r: 1.8, c: 0, a: 1 });
        break;
      case 4: { // 방사선 다발
        const n = 8 + Math.floor(r() * 10), spread = lerp(0.5, 1.5, r());
        for (let k = 0; k < n; k++) {
          const a = ang + (k / (n - 1) - 0.5) * spread, L = lerp(28, 80, r()) * s;
          ln(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, 0.45, 0.5);
        }
        break;
      }
      case 5: { // 점 줄(크기 차이 큰)
        const n = 4 + Math.floor(r() * 5), big = lerp(3, 8, r());
        let o = 0;
        for (let k = 0; k < n; k++) {
          const rad = Math.max(0.6, big * Math.pow(1 - k / n, 1.6));
          this.add({ k: 'dot', x: x + Math.cos(ortho) * o, y: y + Math.sin(ortho) * o, r: rad, c: 0, a: 1 });
          o += rad * 2.4 + 5;
        }
        break;
      }
      case 6: { // 사분 반원 면 + 기준선
        const R = lerp(16, 30, r()) * s;
        this.add({ k: 'bowl', cx: x, cy: y, rot: ortho, ry: R, rxO: R, rxI: 0, t0: -Math.PI / 2, t1: 0, c: 0 });
        ln(x - R * 1.6, y, x + R * 2, y);
        break;
      }
      case 7: { // 수직 해칭 다발(길이 제각각)
        const n = 5 + Math.floor(r() * 9), gap = lerp(4, 9, r()), top = r() < 0.5;
        for (let k = 0; k < n; k++) {
          const L = lerp(25, 130, r()) * s, xx = x + k * gap;
          ln(xx, top ? y : y - L, xx, top ? y + L : y, 0.7, 0.55);
        }
        break;
      }
      case 8: { // 눈금자
        const L = lerp(80, 220, r()) * s, ca = Math.cos(ortho), sa = Math.sin(ortho);
        ln(x, y, x + ca * L, y + sa * L, 0.85, 0.7);
        for (let o = 0; o <= L; o += 8) {
          const t = Math.round(o / 8) % 5 === 0 ? 7 : 3.5;
          ln(x + ca * o - sa * t, y + sa * o + ca * t, x + ca * o, y + sa * o, 0.7, 0.5);
        }
        this.add({ k: 'dot', x: x + ca * L, y: y + sa * L, r: 2.2, c: 0, a: 1 });
        break;
      }
      case 9: // 동심원 + 중심점
        for (let k = 0; k < 2 + Math.floor(r() * 3); k++) ring((10 + k * lerp(6, 14, r())) * s, 0, Math.PI * 2, 0.75 - k * 0.12, 0.6);
        this.add({ k: 'dot', x, y, r: 2, c: 0, a: 1 });
        break;
      case 10: { // 반원 외곽선 + 지름선
        const R = lerp(30, 80, r()) * s;
        ring(R, ortho, ortho + Math.PI, 0.85, 0.8);
        ln(x - Math.cos(ortho) * R * 1.3, y - Math.sin(ortho) * R * 1.3, x + Math.cos(ortho) * R * 1.3, y + Math.sin(ortho) * R * 1.3, 0.8, 0.6);
        break;
      }
      case 11: { // 가는 나선
        const out: number[] = [], turns = lerp(1.5, 3.2, r()), R = lerp(20, 50, r()) * s, dir = r() < 0.5 ? 1 : -1;
        for (let k = 0; k <= 90; k++) { const t = k / 90, a = ang + dir * t * turns * Math.PI * 2; out.push(r1(x + Math.cos(a) * R * t), r1(y + Math.sin(a) * R * t)); }
        this.add({ k: 'poly', p: out, lw: 0.6, c: 0, a: 0.7, fi: 0, fo: 0.2 });
        break;
      }
      case 12: { // 사인파 묶음
        const L = lerp(90, 200, r()) * s, amp = lerp(6, 16, r()), wl = lerp(30, 60, r()), n = 3 + Math.floor(r() * 4);
        const ca = Math.cos(ortho), sa = Math.sin(ortho);
        for (let k = 0; k < n; k++) {
          const out: number[] = [];
          for (let o = 0; o <= L; o += 4) { const w = Math.sin((o / wl) * Math.PI * 2) * amp + k * 5; out.push(r1(x + ca * o - sa * w), r1(y + sa * o + ca * w)); }
          this.add({ k: 'poly', p: out, lw: 0.5, c: 0, a: 0.55 - k * 0.06, fi: 0.15, fo: 0.15 });
        }
        break;
      }
      case 13: { // 점선 직선 + 끝점
        const L = lerp(100, 260, r()) * s;
        this.add({ k: 'line', x0: x, y0: y, x1: x + Math.cos(ortho) * L, y1: y + Math.sin(ortho) * L, lw: 1, c: 0, a: 0.7, dash: 5, ends: 2 });
        break;
      }
      case 14: // 큰 원 외곽선(가늘게)
        ring(lerp(60, 150, r()) * s, ang, ang + Math.PI * lerp(0.8, 2, r()), 0.55, 0.6);
        break;
      default: { // 사선 쐐기
        const L = lerp(50, 110, r()) * s;
        this.add({ k: 'blade', x0: x, y0: y, qx: x + Math.cos(ang) * L * 0.5, qy: y + Math.sin(ang) * L * 0.5, x1: x + Math.cos(ang) * L, y1: y + Math.sin(ang) * L, w0: lerp(6, 12, r()), w1: 0.8, c: 0 });
      }
    }
  }

  // ── 굵은 면 ────────────────────────────────────────────
  private crescent(pts: V[], turn: number, fast: number, r: () => number) {
    const a = pts[0], m = pts[Math.floor(pts.length / 2)], b = pts[pts.length - 1];
    const c = circumcircle(a, m, b);
    if (!c || c.r < 70 || c.r > 240) return;
    this.lastHeavyT = this.t;
    const dir = Math.sign(turn) || 1;
    const t0 = Math.atan2(a[1] - c.y, a[0] - c.x);
    const ext = Math.min(Math.abs(turn), Math.PI * 0.95);
    const thick = lerp(0.15, 0.38, fast) * (0.85 + r() * 0.3);
    const rxI = c.r * (1 - thick);
    const endMode = ext <= Math.PI / 2 + 0.2 || r() < 0.4;
    const rot = endMode ? t0 + dir * ext : t0 + dir * ext / 2;
    const ta = endMode ? -dir * ext : -dir * ext / 2, tb = endMode ? 0 : dir * ext / 2;
    const overlaps = this.heavy.some(h => Math.hypot(h.x - c.x, h.y - c.y) < (h.r + c.r) * 0.55);
    if (overlaps || this.heavy.length >= MAX_HEAVY) {
      if (this.n.hatch >= 6) return;
      this.n.hatch++;
      this.add({ k: 'arcs', cx: c.x, cy: c.y, rot, ry: c.r, rx0: rxI, rx1: c.r * (1 - thick * 2.2), n: 20, t0: ta, t1: tb, lw: 0.6, a0: 0.85, a1: 0.2, c: 0 });
      return;
    }
    this.heavy.push(c);
    this.add({ k: 'bowl', cx: c.x, cy: c.y, rot, ry: c.r, rxO: c.r, rxI, t0: ta, t1: tb, c: 0 });
    this.add({ k: 'ell', cx: c.x, cy: c.y, rx: c.r, ry: c.r, rot: 0, t0, t1: t0 - dir * lerp(0.9, 1.8, r()), lw: 0.9, c: 0, a: 0.85, dot: 0 });
    const y = Math.round(c.y / 6) * 6;
    this.add({ k: 'line', x0: c.x - c.r * lerp(0.9, 1.4, r()), y0: y, x1: c.x + c.r * lerp(1.0, 1.6, r()), y1: y, lw: 0.8, c: 0, a: 0.85 });
    this.add({ k: 'dot', x: c.x, y, r: 2.6, c: 0, a: 0.95 });
  }

  private blade(pts: V[], fast: number) {
    this.n.blades++;
    const a = pts[0], m = pts[Math.floor(pts.length / 2)], b = pts[pts.length - 1];
    const qx = 2 * m[0] - (a[0] + b[0]) / 2, qy = 2 * m[1] - (a[1] + b[1]) / 2;
    this.add({ k: 'blade', x0: a[0], y0: a[1], qx, qy, x1: b[0], y1: b[1], w0: lerp(8, 20, fast), w1: 1, c: 0 });
  }

  // ── 몸 전체 ───────────────────────────────────────────
  private onBody(f: Features, dt: number) {
    if (f.span < 2.2) this.spanArmed = true;
    if (this.spanArmed && f.span > 3.2 && this.n.rings < MAX_RINGS) {
      this.spanArmed = false;
      const r = rng(this.n.rings * 977 + 5);
      const rx = clamp(190 + (f.span - 3) * 110, 190, 470) * this.frame.k;
      const ry = rx * lerp(0.75, 1.1, r());
      const t0 = r() * Math.PI * 2;
      if (this.n.rings % 3 === 2) {
        for (let i = 0; i < 5; i++) this.add({ k: 'ell', cx: CX, cy: CY, rx: rx + i * 12, ry: ry + i * 11, rot: this.frame.rot, t0, t1: t0 + 1.9, lw: 0.5, c: 0, a: 0.32 - i * 0.04, dot: 0 });
      } else {
        this.add({ k: 'ell', cx: CX, cy: CY, rx, ry, rot: this.frame.rot, t0, t1: t0 + Math.PI * lerp(0.55, 1.2, r()), lw: 1.1, c: 0, a: 0.5, dot: 5 + r() * 2 });
      }
      this.n.rings++;
    }

    const hv = Math.hypot(f.head.vx, f.head.vy);
    if (hv > 0.5) {
      this.colAcc += hv * dt;
      if (this.colAcc > 0.3) {
        this.colAcc = 0;
        if (!this.col) {
          const side = f.head.x >= 0 ? 1 : -1;
          this.col = { x: Math.round((CX + side * 260) / 12) * 12, y: CY - 330, i: 0 };
        }
        if (this.col.i < 12) {
          const i = this.col.i++;
          this.add({ k: 'dot', x: this.col.x, y: this.col.y + i * 19, r: i < 11 ? 1.3 + i * 0.18 : 5.5, c: 0, a: 1 });
        }
      }
    }
  }

  // ── 정지 ─────────────────────────────────────────────
  private onStill(f: Features, dt: number) {
    if (f.still < 1.2 || this.stillDots >= 3 || f.still > 9) return;
    this.stillAcc += dt;
    if (this.stillAcc < 1.6) return;
    this.stillAcc = 0;
    const spots: V[] = [...this.pinches.slice(-6), ...this.heavy.map(h => [h.x, h.y] as V)];
    const i = spots.findIndex((_, k) => !this.dotted.has(this.pinches.length * 100 + k));
    if (i < 0) return;
    this.dotted.add(this.pinches.length * 100 + i);
    this.stillDots++;
    this.add({ k: 'dot', x: spots[i][0], y: spots[i][1], r: 2.8 + (i % 3) * 0.7, c: 0, a: 0.95 });
  }

  private cell(p: V) {
    const x = Math.floor(p[0] / GRID), y = Math.floor(p[1] / GRID);
    return x < 0 || y < 0 || x >= GW || y >= GH ? -1 : y * GW + x;
  }

  stats() {
    return { ...this.n, heavy: this.heavy.length, progress: Math.min(1, this.n.nib / COMPLETE_NIB) };
  }
}

// ── 기하 ────────────────────────────────────────────────
const r1 = (v: number) => Math.round(v * 10) / 10;
const unit = (x: number, y: number): V => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function polyLen(p: V[]) { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; }
/** Catmull-Rom 위치/접선 (p1→p2 구간) */
function cr(p0: V, p1: V, p2: V, p3: V, t: number): V {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}
function crd(p0: V, p1: V, p2: V, p3: V, t: number): V {
  const t2 = t * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}
function totalTurn(p: V[]) {
  let s = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const a1 = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
    const a2 = Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    s += d;
  }
  return s;
}
function circumcircle(a: V, b: V, c: V): Circle | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
}
