import type { Arcs, Blade, Bowl, Dot, El, Ell, Ink, Line, Path, Stipple, VHatch } from './elements';

// 조형 문법. 레퍼런스 이미지를 분석해 얻은 골격(수렴점 A·B·D, 두 개의 초승달 면,
// 칼날, 줄기, 점 사슬)을 '글리프 좌표'로 정의한다. 글리프 좌표는 레퍼런스 픽셀에서
// 축 교차점(720, 497)을 뺀 값이다. 모든 빌더는 Frame(회전·크기·이동)을 받아
// 포스터 좌표 요소를 돌려준다 — 정적 재현과 동작 생성이 같은 문법을 쓴다.

export interface Frame { rot: number; k: number; ox: number; oy: number }
export const NEUTRAL: Frame = { rot: 0, k: 1, ox: 0, oy: 0 };

const S = 0.92; // 레퍼런스 px → 포스터 px
const CX = 960, CY = 548;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const norm = (x: number, y: number): [number, number] => { const d = Math.hypot(x, y) || 1; return [x / d, y / d]; };

export function P(f: Frame, gx: number, gy: number): [number, number] {
  const c = Math.cos(f.rot), s = Math.sin(f.rot), m = f.k * S;
  return [CX + f.ox + (gx * c - gy * s) * m, CY + f.oy + (gx * s + gy * c) * m];
}
const L = (f: Frame, v: number) => v * f.k * S;
const Pf = (f: Frame, pts: number[]) => {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(...P(f, pts[i], pts[i + 1]));
  return out;
};

// ── 골격 ───────────────────────────────────────────────
export const B0: [number, number] = [15, -5];      // 중심 수렴점
export const A0: [number, number] = [-22, -207];   // 위쪽 수렴점(칼날 머리)
export const D0: [number, number] = [245, 203];    // 아래쪽 수렴점
export const UP = { cx: 0, cy: -217, ry: 180, rxO: 255, rxI: 110, t0: -Math.PI / 2, t1: 0 };
export const LO = { cx: -80, cy: 195, ry: 183, rxO: 200, rxI: 145, t0: Math.PI * 1.5, t1: Math.PI / 2 };

export interface Stroke { lw: number; a: number; c: Ink; dot?: number }

/** 접선이 주어진 점들을 지나는 베지어 연속 경로(Hermite → Bezier). [x, y, tx, ty]... */
function through(knots: number[][], tension = 0.39): number[] {
  const out = [knots[0][0], knots[0][1]];
  for (let i = 0; i < knots.length - 1; i++) {
    const [x0, y0, a0, b0] = knots[i], [x1, y1, a1, b1] = knots[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0) * tension;
    const [t0x, t0y] = norm(a0, b0), [t1x, t1y] = norm(a1, b1);
    out.push(x0 + t0x * d, y0 + t0y * d, x1 - t1x * d, y1 - t1y * d, x1, y1);
  }
  return out;
}

/** 위쪽 흐름선: A(칼날 머리)에서 위로 나가 왼쪽으로 크게 돌고, 대각선으로 내려와 B를 지난다. u=0 안쪽, u=1 바깥쪽 */
export function fanUpper(f: Frame, u: number, st: Stroke, j = 0): Path {
  const [bx, by] = B0, [ax, ay] = A0;
  const tx = lerp(-65, -160, u) + j * 10, ty = lerp(-248, -350, u) + j * 5;
  const wx = lerp(-118, -318, u) + j * 12, wy = lerp(-172, -215, u) + j * 8;
  const mx = lerp(-52, -235, u) + j * 10, my = lerp(-70, -62, u);
  const pts = through([
    [ax + 34, ay + 58, -0.5, -0.86],
    [ax, ay, -0.55, -0.83],
    [tx, ty, -1, 0.05 + 0.1 * (1 - u)],
    [wx, wy, -0.2 + 0.1 * (1 - u), 1],
    [mx, my, 0.74, 0.67 - 0.1 * u],
    [bx, by, 1, 0.5 - 0.08 * u + j * 0.04],
    [bx + 70, by + 32 - 6 * u + j * 6, 1, 0.44 - 0.08 * u],
  ]);
  return { k: 'path', p: Pf(f, pts), lw: st.lw, c: st.c, a: st.a, fi: 0.1, fo: 0.1, dot: st.dot };
}

/** 아래쪽 흐름선: B에서 대각선으로 나가 오른쪽으로 돌고, D로 모였다가 아래 왼쪽으로 다시 퍼진다. */
export function fanLower(f: Frame, u: number, st: Stroke, j = 0): Path {
  const [bx, by] = B0;
  const dx = D0[0] + 40 * u * u + j * 6, dy = D0[1] + 50 * u * u;
  const rx = lerp(165, 450, Math.pow(u, 1.4)) + j * 10, ry = lerp(85, 150, u);
  const ex = lerp(70, 250, u) + j * 16, ey = lerp(380, 405, u);
  const pts = through([
    [bx - 70, by - 32 + j * 6, 1, 0.45],
    [bx, by, 1, lerp(0.5, 0.12, u) + j * 0.04],
    [rx, ry, lerp(0.55, 0.02, u), lerp(0.85, 1, u)],
    [dx, dy, -0.42 - 0.1 * u, 0.9],
    [ex, ey, lerp(-0.5, -0.25, u), lerp(0.86, 0.97, u)],
  ]);
  return { k: 'path', p: Pf(f, pts), lw: st.lw, c: st.c, a: st.a, fi: 0.08, fo: 0.22, dot: st.dot };
}

/** 굵은 위쪽 갈고리. p0→p1 구간(0..1)만 채운다(누적 생성용 조각). */
export function bowlUpper(f: Frame, p0: number, p1: number): Bowl {
  const [cx, cy] = P(f, UP.cx, UP.cy);
  return { k: 'bowl', cx, cy, rot: f.rot, ry: L(f, UP.ry), rxO: L(f, UP.rxO), rxI: L(f, UP.rxI), t0: lerp(UP.t0, UP.t1, p0), t1: lerp(UP.t0, UP.t1, p1), c: 0 };
}
export function bowlLower(f: Frame, p0: number, p1: number): Bowl {
  const [cx, cy] = P(f, LO.cx, LO.cy);
  return { k: 'bowl', cx, cy, rot: f.rot, ry: L(f, LO.ry), rxO: L(f, LO.rxO), rxI: L(f, LO.rxI), t0: lerp(LO.t0, LO.t1, p0), t1: lerp(LO.t0, LO.t1, p1), c: 0 };
}
/** 아래 초승달 안쪽의 동심 해칭(가로 기준선 아래 사분면). i0..i1 줄만. */
export function hatchLower(f: Frame, i0: number, i1: number, total = 30): Arcs {
  const [cx, cy] = P(f, LO.cx, LO.cy);
  const rx = (i: number) => L(f, lerp(LO.rxI + 2, 66, i / (total - 1)));
  const a = (i: number) => lerp(0.95, 0.25, Math.pow(i / (total - 1), 0.8));
  return { k: 'arcs', cx, cy, rot: f.rot, ry: L(f, LO.ry), rx0: rx(i0), rx1: rx(i1), n: i1 - i0 + 1, t0: Math.PI, t1: Math.PI / 2, lw: 0.7, a0: a(i0), a1: a(i1), c: 0 };
}
/** 갈고리 위의 얇은 외곽선(왼쪽으로 이어지는 원) */
export function hookOutline(f: Frame): Ell {
  const [cx, cy] = P(f, UP.cx, UP.cy);
  return { k: 'ell', cx, cy, rx: L(f, 98), ry: L(f, UP.ry), rot: f.rot, t0: Math.PI, t1: Math.PI * 1.5, lw: 1, c: 0, a: 0.85, dot: 0 };
}

function bladeFrom(f: Frame, a: number[], q: number[], b: number[], w0: number, w1: number, p: number): Blade {
  // 2차 곡선을 0..p 구간으로 자른다(de Casteljau)
  const qx = lerp(a[0], q[0], p), qy = lerp(a[1], q[1], p);
  const mx = lerp(q[0], b[0], p), my = lerp(q[1], b[1], p);
  const ex = lerp(qx, mx, p), ey = lerp(qy, my, p);
  const [x0, y0] = P(f, a[0], a[1]), [x1, y1] = P(f, qx, qy), [x2, y2] = P(f, ex, ey);
  return { k: 'blade', x0, y0, qx: x1, qy: y1, x1: x2, y1: y2, w0: L(f, w0), w1: L(f, lerp(w0, w1, p)), c: 0 };
}
/** 가운데 돛 모양 면: 왼쪽은 수직, 오른쪽은 휘어진 사분 타원. p0→p1 조각. */
export const SAIL = { cx: -2, cy: -7, ry: 197, rx: 120 };
export function sail(f: Frame, p0: number, p1: number): Bowl {
  const [cx, cy] = P(f, SAIL.cx, SAIL.cy);
  return { k: 'bowl', cx, cy, rot: f.rot, ry: L(f, SAIL.ry), rxO: L(f, SAIL.rx), rxI: 0, t0: lerp(-Math.PI / 2, 0, p0), t1: lerp(-Math.PI / 2, 0, p1), c: 0 };
}
/** 축 아래로 이어지는 가는 줄기 */
export const stem = (f: Frame, p: number) => bladeFrom(f, [12, 4], [12, 70], [9, 150], 20, 1.5, p);

/** 줄기 주변 수직 헤어라인 */
export function stemHatch(f: Frame, seed: number, x0: number, x1: number, y0: number, y1: number, ink: Ink, n: number, a = 0.6, jag = 0): VHatch {
  const [ax, ay] = P(f, x0, y0), [bx] = P(f, x1, y0), [, by] = P(f, x0, y1);
  return { k: 'vh', x0: ax, x1: bx, y0: ay, y1: by, n, lw: 0.6, c: ink, a, seed, jag: L(f, jag) };
}

// ── 점 사슬 ─────────────────────────────────────────────
export interface Chain { cx: number; cy: number; rx: number; ry: number; t0: number; t1: number; peak: number; rMin: number; rMax: number }
export const CHAINS: Chain[] = [
  { cx: -110, cy: -187, rx: 160, ry: 175, t0: 4.2, t1: 1.95, peak: 2.65, rMin: 0.9, rMax: 4.6 },  // 왼쪽 안
  { cx: -205, cy: -230, rx: 138, ry: 182, t0: 3.55, t1: 2.0, peak: 2.85, rMin: 1.2, rMax: 4.2 }, // 왼쪽 바깥
  { cx: 270, cy: 233, rx: 133, ry: 165, t0: 4.5, t1: 7.5, peak: 6.25, rMin: 1.2, rMax: 6.6 },   // 오른쪽 바깥
  { cx: 182, cy: 243, rx: 108, ry: 150, t0: 4.05, t1: 7.25, peak: 6.0, rMin: 0.8, rMax: 2.4 },  // 오른쪽 안
];
export function chainEnv(ch: Chain, t: number) {
  const span = Math.abs(ch.t1 - ch.t0);
  const d = Math.abs(t - ch.peak) / (span * 0.55);
  return lerp(ch.rMin, ch.rMax, Math.max(0, 1 - d * d));
}
export function bead(f: Frame, ch: Chain, t: number, scale = 1, a = 1): Dot {
  const [x, y] = P(f, ch.cx + ch.rx * Math.cos(t), ch.cy + ch.ry * Math.sin(t));
  return { k: 'dot', x, y, r: L(f, chainEnv(ch, t) * scale), c: 0, a };
}
/** 사슬 위 t 다음 점까지의 간격(점이 클수록 넓게) */
export function chainStep(ch: Chain, t: number) {
  const r = chainEnv(ch, t);
  const arc = (r * 2 + 6 + r * 1.6) / ((ch.rx + ch.ry) / 2);
  return arc * Math.sign(ch.t1 - ch.t0);
}

// ── 미세 구조 ───────────────────────────────────────────
export function line(f: Frame, x0: number, y0: number, x1: number, y1: number, lw = 0.8, a = 0.9, c: Ink = 0, dash = 0, ends = 0): Line {
  const [a0, b0] = P(f, x0, y0), [a1, b1] = P(f, x1, y1);
  return { k: 'line', x0: a0, y0: b0, x1: a1, y1: b1, lw, c, a, dash, ends };
}
export function dot(f: Frame, x: number, y: number, r: number, a = 1, c: Ink = 0): Dot {
  const [px, py] = P(f, x, y);
  return { k: 'dot', x: px, y: py, r: L(f, r), c, a };
}
export function ell(f: Frame, cx: number, cy: number, rx: number, ry: number, t0: number, t1: number, dotGap: number, a = 0.7, lw = 1.1, c: Ink = 0): Ell {
  const [x, y] = P(f, cx, cy);
  return { k: 'ell', cx: x, cy: y, rx: L(f, rx), ry: L(f, ry), rot: f.rot, t0, t1, lw, c, a, dot: dotGap };
}
export function stipple(f: Frame, x: number, y: number, ang: number, len: number, wid: number, n: number, seed: number, a = 0.8, r = 0.9): Stipple {
  const [px, py] = P(f, x, y);
  return { k: 'stip', x: px, y: py, ang: ang + f.rot, len: L(f, len), wid: L(f, wid), n, r, seed, c: 0, a };
}

/** 그리드 기준선들(정지 시 노드 점, 시작 축 등에 쓰인다) */
export const NODES: [number, number][] = [
  [-95, 180], [-2, -217], [-345, 0], [452, 0], [-482, 15], [-95, -427], [60, 443], [220, -197], [305, 180],
];

export type Emit = (e: El) => void;
