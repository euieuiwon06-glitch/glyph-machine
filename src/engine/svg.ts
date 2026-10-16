import { BG, H, W, cubicPts, ellPt, inkRGB, rng, type El } from './elements';

// 요소 목록 → SVG(벡터). 캔버스 그리기(draw)와 같은 규칙으로 옮겨서 화면과 같은 그림이 나온다.
// 화면 위 버튼·안내 문구는 요소 목록에 없으므로 결과물에 들어가지 않는다.

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const col = (c: number) => inkRGB(c as 0);
const pts = (p: number[]) => { let s = ''; for (let i = 0; i < p.length; i += 2) s += `${i ? 'L' : 'M'}${f1(p[i])} ${f1(p[i + 1])}`; return s; };
const sampleEll = (cx: number, cy: number, rx: number, ry: number, rot: number, t0: number, t1: number) => {
  const n = Math.max(8, Math.ceil(Math.abs(t1 - t0) * Math.max(rx, ry) / 4));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(...ellPt(cx, cy, rx, ry, rot, t0 + (t1 - t0) * (i / n)));
  return out;
};
const dash = (gap?: number) => gap ? ` stroke-dasharray="0.01 ${f1(gap)}" stroke-linecap="round"` : '';

function one(e: El): string {
  switch (e.k) {
    case 'bowl': {
      const N = Math.max(8, Math.ceil(Math.abs(e.t1 - e.t0) * 60));
      const o: number[] = [];
      for (let i = 0; i <= N; i++) o.push(...ellPt(e.cx, e.cy, e.rxO, e.ry, e.rot, e.t0 + (e.t1 - e.t0) * (i / N)));
      for (let i = N; i >= 0; i--) o.push(...ellPt(e.cx, e.cy, e.rxI, e.ry, e.rot, e.t0 + (e.t1 - e.t0) * (i / N)));
      return `<path d="${pts(o)}Z" fill="${col(e.c)}"/>`;
    }
    case 'arcs': {
      let s = '';
      for (let i = 0; i < e.n; i++) {
        const t = e.n === 1 ? 0 : i / (e.n - 1);
        const rx = e.rx0 + (e.rx1 - e.rx0) * t;
        s += `<path d="${pts(sampleEll(e.cx, e.cy, rx, e.ry, e.rot, e.t0, e.t1))}" fill="none" stroke="${col(e.c)}" stroke-opacity="${f1(e.a0 + (e.a1 - e.a0) * t)}" stroke-width="${e.lw}"/>`;
      }
      return s;
    }
    case 'path':
    case 'poly': {
      const p = e.k === 'path' ? cubicPts(e.p) : e.p;
      const n = p.length / 2 - 1;
      const cap = e.k === 'poly' && !e.dot ? 'butt' : 'round';
      const attrs = `fill="none" stroke="${col(e.c)}" stroke-width="${e.lw}" stroke-linecap="${cap}"${e.dot ? ` stroke-dasharray="0.01 ${f1(e.dot)}"` : ''}`;
      const seg = (a: number, b: number, op: number) => b > a ? `<path d="${pts(p.slice(a * 2, b * 2 + 2))}" ${attrs} stroke-opacity="${f1(Math.max(0, op))}"/>` : '';
      const fi = Math.floor(n * e.fi), fo = Math.floor(n * e.fo), STEP = 4;
      let s = '';
      for (let i = 0; i < fi; i += STEP) s += seg(i, Math.min(i + STEP, fi), e.a * ((i + STEP / 2) / fi));
      s += seg(fi, n - fo, e.a);
      for (let i = n - fo; i < n; i += STEP) s += seg(i, Math.min(i + STEP, n), e.a * (1 - (i - (n - fo) + STEP / 2) / fo));
      return s;
    }
    case 'blade': {
      const N = 48, L: number[] = [], R: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const x = u * u * e.x0 + 2 * u * t * e.qx + t * t * e.x1, y = u * u * e.y0 + 2 * u * t * e.qy + t * t * e.y1;
        let dx = 2 * u * (e.qx - e.x0) + 2 * t * (e.x1 - e.qx), dy = 2 * u * (e.qy - e.y0) + 2 * t * (e.y1 - e.qy);
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const w = (e.w0 + (e.w1 - e.w0) * t) / 2;
        L.push(x - dy * w, y + dx * w); R.push(x + dy * w, y - dx * w);
      }
      const back: number[] = [];
      for (let i = R.length - 2; i >= 0; i -= 2) back.push(R[i], R[i + 1]);
      return `<path d="${pts([...L, ...back])}Z" fill="${col(e.c)}"/>`;
    }
    case 'dot':
      return `<circle cx="${f1(e.x)}" cy="${f1(e.y)}" r="${f1(e.r)}" fill="${col(e.c)}" fill-opacity="${f1(e.a)}"/>`;
    case 'line': {
      const lw = e.dash ? Math.max(e.lw, 1.4) : e.lw;
      let s = `<line x1="${f1(e.x0)}" y1="${f1(e.y0)}" x2="${f1(e.x1)}" y2="${f1(e.y1)}" stroke="${col(e.c)}" stroke-opacity="${f1(e.a)}" stroke-width="${lw}"${dash(e.dash)}/>`;
      if (e.ends) for (const [x, y] of [[e.x0, e.y0], [e.x1, e.y1]]) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${e.ends}" fill="${col(e.c)}" fill-opacity="${f1(Math.min(1, e.a + 0.2))}"/>`;
      return s;
    }
    case 'ell':
      return `<path d="${pts(sampleEll(e.cx, e.cy, e.rx, e.ry, e.rot, e.t0, e.t1))}" fill="none" stroke="${col(e.c)}" stroke-opacity="${f1(e.a)}" stroke-width="${e.lw}"${dash(e.dot)}/>`;
    case 'stip': {
      const r = rng(e.seed);
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
      let d = '';
      for (let i = 0; i < e.n; i++) {
        const l = Math.pow(r(), 1.6) * e.len;
        const g = (r() + r() + r() - 1.5) / 1.5;
        const w = g * e.wid * (0.35 + 0.65 * (l / e.len));
        const x = e.x + ca * l - sa * w, y = e.y + sa * l + ca * w;
        const s = e.r * (0.25 + Math.pow(r(), 4) * 1.6);
        if (s < 0.75) d += `M${f1(x - s)} ${f1(y - s)}h${f1(s * 2)}v${f1(s * 2)}h${f1(-s * 2)}z`;
        else d += `M${f1(x - s)} ${f1(y)}a${f1(s)} ${f1(s)} 0 1 0 ${f1(s * 2)} 0a${f1(s)} ${f1(s)} 0 1 0 ${f1(-s * 2)} 0z`;
      }
      return `<path d="${d}" fill="${col(e.c)}" fill-opacity="${f1(e.a)}"/>`;
    }
    case 'vh': {
      const r = rng(e.seed);
      let d = '';
      for (let i = 0; i < e.n; i++) {
        const x = e.x0 + (e.x1 - e.x0) * (e.n === 1 ? 0.5 : i / (e.n - 1));
        const j0 = r() * e.jag, j1 = r() * e.jag;
        d += `M${f1(x)} ${f1(e.y0 + j0)}L${f1(x)} ${f1(e.y1 - j1)}`;
      }
      return `<path d="${d}" stroke="${col(e.c)}" stroke-opacity="${f1(e.a)}" stroke-width="${e.lw}"/>`;
    }
    case 'cross':
      return `<path d="M${f1(e.x - e.s)} ${f1(e.y)}h${f1(e.s * 2)}M${f1(e.x)} ${f1(e.y - e.s)}v${f1(e.s * 2)}" stroke="${col(e.c)}" stroke-opacity="${f1(e.a)}" stroke-width="${e.lw}"/>`;
    case 'fill':
      return `<path d="${pts(e.p)}Z" fill="${col(e.c)}" fill-opacity="${f1(e.a)}"/>`;
    case 'bars': {
      let d = '';
      for (let i = 0; i < e.segs.length; i += 2) d += `M${f1(e.segs[i])} ${f1(e.y - e.h / 2)}h${f1(e.segs[i + 1] - e.segs[i])}v${f1(e.h)}h${f1(e.segs[i] - e.segs[i + 1])}z`;
      return `<path d="${d}" fill="${col(e.c)}" fill-opacity="${f1(e.a)}"/>`;
    }
  }
}

export function toSVG(els: readonly El[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${H * 2}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${BG}"/>
${els.map(one).join('\n')}
</svg>
`;
}
