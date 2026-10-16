// 포스터를 이루는 그래픽 요소. 모두 포스터 좌표(1920×1080) 기준의 순수 데이터라서
// 화면 크기가 바뀌거나 4K로 저장할 때 같은 목록을 그대로 다시 그릴 수 있다.

export const W = 1920;
export const H = 1080;
export const BG = '#ffffff';

// 0: 메인 #111, 1: 보조 #555, 2: 미세선 #B5B5B5, 3: 종이색(검정 면 위의 흰 선)
const INK = [[17, 17, 17], [85, 85, 85], [181, 181, 181], [255, 255, 255]] as const;
export type Ink = 0 | 1 | 2 | 3;
/** SVG용 색 */
export const inkRGB = (c: Ink) => `rgb(${INK[c][0]},${INK[c][1]},${INK[c][2]})`;
const rgba = (c: Ink, a: number) => `rgba(${INK[c][0]},${INK[c][1]},${INK[c][2]},${a})`;

/** 두꺼운 초승달 면: 같은 ry, 다른 rx의 두 타원 사이를 t0→t1 구간만 채운다. */
export interface Bowl { k: 'bowl'; cx: number; cy: number; rot: number; ry: number; rxO: number; rxI: number; t0: number; t1: number; c: Ink }
/** 동심 타원호 묶음(해칭). 모두 같은 ry를 공유해 한 점으로 모인다. */
export interface Arcs { k: 'arcs'; cx: number; cy: number; rot: number; ry: number; rx0: number; rx1: number; n: number; t0: number; t1: number; lw: number; a0: number; a1: number; c: Ink }
/** 3차 베지어 연속 경로. 양 끝은 fadeIn/fadeOut 비율만큼 옅어진다. */
export interface Path { k: 'path'; p: number[]; lw: number; c: Ink; a: number; fi: number; fo: number; dot?: number }
/** 이미 펼쳐진 점열(x0,y0,x1,y1…)을 잇는 선. 움직임 궤적에서 바로 만든 흐름선. */
export interface Poly { k: 'poly'; p: number[]; lw: number; c: Ink; a: number; fi: number; fo: number; dot?: number }
/** 끝이 가늘어지는 칼날 면(2차 곡선 중심선). */
export interface Blade { k: 'blade'; x0: number; y0: number; qx: number; qy: number; x1: number; y1: number; w0: number; w1: number; c: Ink }
export interface Dot { k: 'dot'; x: number; y: number; r: number; c: Ink; a: number }
export interface Line { k: 'line'; x0: number; y0: number; x1: number; y1: number; lw: number; c: Ink; a: number; dash?: number; ends?: number }
/** 타원 외곽선. dot>0이면 점선(둥근 점), 아니면 실선. */
export interface Ell { k: 'ell'; cx: number; cy: number; rx: number; ry: number; rot: number; t0: number; t1: number; lw: number; c: Ink; a: number; dot: number }
/** 한 방향으로 길쭉한 입자 구름. seed로 매번 같은 점이 나온다. */
export interface Stipple { k: 'stip'; x: number; y: number; ang: number; len: number; wid: number; n: number; r: number; seed: number; c: Ink; a: number }
/** 수직 헤어라인 묶음. */
export interface VHatch { k: 'vh'; x0: number; x1: number; y0: number; y1: number; n: number; lw: number; c: Ink; a: number; seed: number; jag: number }
/** 채운 다각형(펜촉 마디, 삼각 면) */
export interface Fill { k: 'fill'; p: number[]; c: Ink; a: number }
/** 한 줄의 가로 막대들(x0,x1 쌍) */
export interface Bars { k: 'bars'; y: number; segs: number[]; h: number; c: Ink; a: number }
export interface Cross { k: 'cross'; x: number; y: number; s: number; lw: number; c: Ink; a: number }

export type El = Bowl | Arcs | Path | Poly | Fill | Bars | Blade | Dot | Line | Ell | Stipple | VHatch | Cross;

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function ellPt(cx: number, cy: number, rx: number, ry: number, rot: number, t: number): [number, number] {
  const x = rx * Math.cos(t), y = ry * Math.sin(t);
  const c = Math.cos(rot), s = Math.sin(rot);
  return [cx + x * c - y * s, cy + x * s + y * c];
}

export function cubicPts(p: number[], per = 40): number[] {
  const out: number[] = [p[0], p[1]];
  for (let i = 0; i + 7 < p.length; i += 6) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = p.slice(i, i + 8);
    for (let j = 1; j <= per; j++) {
      const t = j / per, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
    }
  }
  return out;
}

export function draw(ctx: CanvasRenderingContext2D, e: El) {
  switch (e.k) {
    case 'bowl': {
      const N = Math.max(8, Math.ceil(Math.abs(e.t1 - e.t0) * 60));
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const [x, y] = ellPt(e.cx, e.cy, e.rxO, e.ry, e.rot, e.t0 + (e.t1 - e.t0) * (i / N));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let i = N; i >= 0; i--) {
        const [x, y] = ellPt(e.cx, e.cy, e.rxI, e.ry, e.rot, e.t0 + (e.t1 - e.t0) * (i / N));
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(e.c, 1);
      ctx.fill();
      break;
    }
    case 'arcs': {
      ctx.lineWidth = e.lw;
      const N = Math.max(12, Math.ceil(Math.abs(e.t1 - e.t0) * 50));
      for (let i = 0; i < e.n; i++) {
        const f = e.n === 1 ? 0 : i / (e.n - 1);
        const rx = e.rx0 + (e.rx1 - e.rx0) * f;
        ctx.strokeStyle = rgba(e.c, e.a0 + (e.a1 - e.a0) * f);
        ctx.beginPath();
        for (let j = 0; j <= N; j++) {
          const [x, y] = ellPt(e.cx, e.cy, rx, e.ry, e.rot, e.t0 + (e.t1 - e.t0) * (j / N));
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'path':
    case 'poly': {
      const pts = e.k === 'path' ? cubicPts(e.p) : e.p;
      const n = pts.length / 2 - 1;
      ctx.lineWidth = e.lw;
      // 실시간 조각(poly)은 이음매에 진한 점이 생기지 않게 납작한 끝으로
      ctx.lineCap = e.k === 'poly' && !e.dot ? 'butt' : 'round';
      if (e.dot) ctx.setLineDash([0.01, e.dot]);
      // 본체는 한 번에, 양 끝 페이드 구간은 잘게 나눠 알파를 줄인다
      const fi = Math.floor(n * e.fi), fo = Math.floor(n * e.fo);
      const seg = (from: number, to: number, a: number) => {
        if (to <= from) return;
        ctx.strokeStyle = rgba(e.c, a);
        ctx.beginPath();
        ctx.moveTo(pts[from * 2], pts[from * 2 + 1]);
        for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
        ctx.stroke();
      };
      const STEP = 4;
      for (let i = 0; i < fi; i += STEP) seg(i, Math.min(i + STEP, fi), e.a * ((i + STEP / 2) / fi));
      seg(fi, n - fo, e.a);
      for (let i = n - fo; i < n; i += STEP) seg(i, Math.min(i + STEP, n), e.a * (1 - (i - (n - fo) + STEP / 2) / fo));
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      break;
    }
    case 'blade': {
      const N = 48, L: number[] = [], R: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const x = u * u * e.x0 + 2 * u * t * e.qx + t * t * e.x1;
        const y = u * u * e.y0 + 2 * u * t * e.qy + t * t * e.y1;
        let dx = 2 * u * (e.qx - e.x0) + 2 * t * (e.x1 - e.qx);
        let dy = 2 * u * (e.qy - e.y0) + 2 * t * (e.y1 - e.qy);
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const w = (e.w0 + (e.w1 - e.w0) * t) / 2;
        L.push(x - dy * w, y + dx * w); R.push(x + dy * w, y - dx * w);
      }
      ctx.beginPath();
      ctx.moveTo(L[0], L[1]);
      for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
      for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
      ctx.closePath();
      ctx.fillStyle = rgba(e.c, 1);
      ctx.fill();
      break;
    }
    case 'dot': {
      ctx.fillStyle = rgba(e.c, e.a);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'line': {
      ctx.strokeStyle = rgba(e.c, e.a);
      ctx.lineWidth = e.lw;
      if (e.dash) { ctx.setLineDash([0.01, e.dash]); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(e.lw, 1.4); }
      ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
      if (e.ends) {
        ctx.fillStyle = rgba(e.c, Math.min(1, e.a + 0.2));
        for (const [x, y] of [[e.x0, e.y0], [e.x1, e.y1]]) { ctx.beginPath(); ctx.arc(x, y, e.ends, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case 'ell': {
      ctx.strokeStyle = rgba(e.c, e.a);
      ctx.lineWidth = e.dot > 0 ? e.lw : e.lw;
      if (e.dot > 0) { ctx.setLineDash([0.01, e.dot]); ctx.lineCap = 'round'; }
      ctx.beginPath();
      ctx.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, e.t0, e.t1, e.t1 < e.t0);
      ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
      break;
    }
    case 'stip': {
      const r = rng(e.seed);
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
      ctx.fillStyle = rgba(e.c, e.a);
      for (let i = 0; i < e.n; i++) {
        // 길이 방향은 앞쪽(0)에 몰리고, 폭은 가우시안에 가깝게
        const l = Math.pow(r(), 1.6) * e.len;
        const g = (r() + r() + r() - 1.5) / 1.5;
        const w = g * e.wid * (0.35 + 0.65 * (l / e.len));
        const x = e.x + ca * l - sa * w, y = e.y + sa * l + ca * w;
        const s = e.r * (0.25 + Math.pow(r(), 4) * 1.6);
        if (s < 0.75) ctx.fillRect(x - s, y - s, s * 2, s * 2);
        else { ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case 'vh': {
      const r = rng(e.seed);
      ctx.strokeStyle = rgba(e.c, e.a);
      ctx.lineWidth = e.lw;
      ctx.beginPath();
      for (let i = 0; i < e.n; i++) {
        const x = e.x0 + (e.x1 - e.x0) * (e.n === 1 ? 0.5 : i / (e.n - 1));
        const j0 = r() * e.jag, j1 = r() * e.jag;
        ctx.moveTo(x, e.y0 + j0); ctx.lineTo(x, e.y1 - j1);
      }
      ctx.stroke();
      break;
    }
    case 'fill': {
      ctx.fillStyle = rgba(e.c, e.a);
      ctx.beginPath();
      ctx.moveTo(e.p[0], e.p[1]);
      for (let i = 2; i < e.p.length; i += 2) ctx.lineTo(e.p[i], e.p[i + 1]);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bars': {
      ctx.fillStyle = rgba(e.c, e.a);
      for (let i = 0; i < e.segs.length; i += 2) ctx.fillRect(e.segs[i], e.y - e.h / 2, e.segs[i + 1] - e.segs[i], e.h);
      break;
    }
    case 'cross': {
      ctx.strokeStyle = rgba(e.c, e.a);
      ctx.lineWidth = e.lw;
      ctx.beginPath();
      ctx.moveTo(e.x - e.s, e.y); ctx.lineTo(e.x + e.s, e.y);
      ctx.moveTo(e.x, e.y - e.s); ctx.lineTo(e.x, e.y + e.s);
      ctx.stroke();
      break;
    }
  }
}
