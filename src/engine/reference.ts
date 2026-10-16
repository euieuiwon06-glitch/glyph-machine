import {
  CHAINS, NEUTRAL as F, bead, bowlLower, bowlUpper, chainStep, dot, ell, fanLower, fanUpper,
  hatchLower, hookOutline, line, P, sail, stem, stemHatch, stipple, type Emit,
} from './grammar';
import { rng } from './elements';

// STEP 1 — 레퍼런스 정적 재현. 동작 생성과 같은 문법(grammar.ts)만으로 조립한다.
export function composeReference(add: Emit) {
  const r = rng(7);
  const PI = Math.PI;

  // Layer 04 — 미세 구조
  add(line(F, -398, 0, 452, 0, 1, 0.95, 0, 0));
  add(dot(F, 452, 0, 3.6)); add(dot(F, -345, 0, 3));
  add(line(F, -482, 15, -10, 15, 1, 0.55, 1, 5)); add(dot(F, -482, 15, 3));
  add(line(F, -2, -457, -2, 448, 1.1, 0.95)); add(dot(F, -2, -457, 2.4));
  add(line(F, -95, -427, -95, 383, 0.8, 0.9)); add(dot(F, -95, -427, 2.6)); add(dot(F, -95, 180, 3.4));
  for (let y = 393; y <= 445; y += 17) add(dot(F, -95, y, 2.3));
  add(line(F, -345, -135, -345, 143, 0.8, 0.85));
  const [cx, cy] = P(F, -345, -127);
  add({ k: 'cross', x: cx, y: cy, s: 6, lw: 0.9, c: 0, a: 0.9 });
  add(line(F, -180, -217, 255, -217, 0.8, 0.9)); add(line(F, 255, -217, 385, -217, 0.8, 0.6, 1, 5));
  add(line(F, -230, 180, 305, 180, 0.8, 0.9));
  for (const x of [140, 170, 200]) add(line(F, x, -217, x, -10, 0.6, 0.7));
  for (const x of [330, 341]) add(line(F, x, -82, x, -4, 0.6, 0.75));
  for (const x of [-322, -311, -299]) add(line(F, x, 150, x, 236, 0.6, 0.75, 0, 0, 1.4));
  add(line(F, 60, 95, 60, 445, 0.7, 0.85)); add(dot(F, 60, 445, 2.6));
  add(line(F, 30, -200, 30, 160, 0.5, 0.6));
  add(line(F, 22, -14, 300, -112, 0.8, 0.6, 1, 5));
  add(line(F, 22, 9, 430, 26, 0.8, 0.55, 1, 5));

  add(ell(F, 232, -217, 160, 222, -PI / 2 - 0.35, 0.12, 5, 0.65));
  add(ell(F, -160, -150, 225, 245, PI * 0.6, PI * 1.38, 6, 0.4));
  add(ell(F, -270, 205, 160, 150, PI * 0.55, PI * 1.28, 5, 0.5));
  add(ell(F, 160, 205, 430, 250, 0.12, PI * 0.78, 6, 0.42));
  add(ell(F, -80, 195, 96, 118, 0.25, 2.55, 5, 0.55));
  add(ell(F, -80, 195, 88, 183, -PI / 2, -0.35, 0, 0.8, 0.8));
  for (let i = 0; i < 6; i++) add(ell(F, 262, 230, 205 + i * 13, 238 + i * 12, -1.3, 1.0, 0, 0.32 - i * 0.03, 0.5));
  add(hookOutline(F));

  // Layer 02 — 흐름선
  const NU = 150, NL = 160;
  const fanStroke = (u: number): { lw: number; a: number; c: 0 | 1; dot?: number } => {
    const d = r();
    if (d < 0.08) return { lw: 1.3, a: 0.7, c: 0, dot: 4 + r() * 3 };
    if (d < 0.14) return { lw: 0.9, a: 0.75, c: 0 };
    return { lw: 0.5, a: lerpA(0.7, 0.3, u, r), c: r() < 0.2 ? 1 : 0 };
  };
  for (let i = 0; i < NU; i++) {
    const u = Math.pow((i + r() * 0.6) / NU, 0.9);
    add(fanUpper(F, u, fanStroke(u), r() - 0.5));
  }
  for (let i = 0; i < NL; i++) {
    const u = Math.pow((i + r() * 0.6) / NL, 0.95);
    add(fanLower(F, u, fanStroke(u), r() - 0.5));
  }

  // Layer 03 — 입자 구름
  add(stipple(F, -12, -190, -2.17, 150, 36, 2600, 11, 0.85));
  add(stipple(F, 15, -5, Math.PI + 0.45, 120, 16, 1300, 15, 0.8));
  add(stipple(F, 15, -5, 0.42, 130, 18, 1300, 16, 0.75));
  add(stipple(F, 270, 140, 2.0, 190, 30, 2200, 12, 0.75));
  add(stipple(F, -170, 30, 0.35, 120, 42, 260, 14, 0.55, 0.8));

  // Layer 01 — 구조 면
  add(bowlUpper(F, 0, 1));
  add(bowlLower(F, 0, 1));
  add(hatchLower(F, 0, 29));
  add(sail(F, 0, 1));
  add(stemHatch(F, 21, 1, 42, -98, -9, 3, 9, 0.85, 6));
  add(stemHatch(F, 22, 1, 42, -6, 45, 0, 10, 0.45, 25));
  add(stem(F, 1));

  // 점 사슬
  for (const ch of CHAINS) {
    for (let t = ch.t0; (ch.t1 - t) * Math.sign(ch.t1 - ch.t0) > 0; t += chainStep(ch, t)) add(bead(F, ch, t));
  }
  for (let i = 0; i < 11; i++) add(dot(F, 220, -422 + i * 19.5, 1.4 + i * 0.17));
  add(dot(F, 220, -197, 6));

}

function lerpA(a: number, b: number, u: number, r: () => number) {
  return (a + (b - a) * u) * (0.75 + r() * 0.5);
}
