import type { Landmark } from './features';

// 개발용 가상 몸(?sim). 카메라 없이 정해진 동작 대본을 랜드마크로 만들어
// 실제 MediaPipe 출력과 같은 경로(FeatureTracker)로 흘려 보낸다.
// 대본: 팔 위아래 → 양팔 벌리기 → 상체 기울이며 휘젓기 → 빠른 흔들기 → 정지 → 반복

type Pose = { lw: [number, number]; rw: [number, number]; tilt: number; lean: number; head: [number, number] };
interface Phase { dur: number; at: (t: number) => Pose }

const rest = (): Pose => ({ lw: [-0.9, 2.1], rw: [0.9, 2.1], tilt: 0, lean: 0, head: [0, -0.9] });
const S = Math.sin, C = Math.cos;

export const SCRIPT: Phase[] = [
  // 오른팔을 천천히 위아래로
  { dur: 4, at: t => ({ ...rest(), rw: [1.3 + 0.2 * S(t), 0.6 - 1.9 * S(t * 1.6)] }) },
  // 양팔을 크게 벌렸다 모으기
  { dur: 4, at: t => { const o = 0.5 + 0.5 * S(t * 1.4 - 1.5); return { ...rest(), lw: [-0.6 - 2.2 * o, 1.2 - 1.3 * o], rw: [0.6 + 2.2 * o, 1.2 - 1.3 * o] }; } },
  // 왼팔 아래쪽 원 그리기
  { dur: 4, at: t => ({ ...rest(), lw: [-1.2 + 0.9 * C(t * 2.2), 1.5 + 0.8 * S(t * 2.2)] }) },
  // 상체를 기울인 채 양팔 휘젓기
  { dur: 4, at: t => ({ ...rest(), tilt: 0.22, lean: 0.18, lw: [-1.4 + 0.8 * S(t * 2.5), 0.5 + 1.0 * C(t * 2.5)], rw: [1.6 + 0.6 * C(t * 2.0), 0.2 + 1.2 * S(t * 2.0)] }) },
  // 빠른 흔들기
  { dur: 3, at: t => ({ ...rest(), lw: [-1.5 + 0.5 * S(t * 11), 0.4 + 0.7 * C(t * 9)], rw: [1.5 + 0.5 * C(t * 12), 0.8 + 0.8 * S(t * 10)], head: [0.1 * S(t * 7), -0.9 + 0.08 * C(t * 9)] }) },
  // 고개 끄덕이기
  { dur: 2, at: t => ({ ...rest(), head: [0, -0.9 + 0.18 * S(t * 7)] }) },
  // 정지
  { dur: 5, at: () => ({ ...rest(), lw: [-1.0, 1.9], rw: [1.0, 1.9] }) },
];
const TOTAL = SCRIPT.reduce((a, p) => a + p.dur, 0);

export function simLandmarks(tSec: number, loop = true): Landmark[] | null {
  let t = loop ? tSec % TOTAL : Math.min(tSec, TOTAL - 0.001);
  let ph = SCRIPT[0];
  for (const p of SCRIPT) { if (t < p.dur) { ph = p; break; } t -= p.dur; }
  // 단계 경계에서 튀지 않게 시작 1초는 쉬는 자세와 섞는다
  const q = ph.at(t), r = rest(), m = Math.min(1, t / 1.0);
  const mix = (a: [number, number], b: [number, number]): [number, number] => [b[0] + (a[0] - b[0]) * m, b[1] + (a[1] - b[1]) * m];
  const pose: Pose = { lw: mix(q.lw, r.lw), rw: mix(q.rw, r.rw), tilt: q.tilt * m, lean: q.lean * m, head: mix(q.head, r.head) };

  // 몸 좌표(sw) → 정규화 이미지 좌표(거울 이전). 어깨 너비 = 이미지 폭의 0.22
  const sw = 0.22, cx = 0.5 + pose.lean * 0.2, cy = 0.42, aspect = 4 / 3;
  const ct = C(pose.tilt), st = S(pose.tilt);
  const img = ([x, y]: [number, number]): Landmark => {
    const rx = x * ct - y * st, ry = x * st + y * ct;
    // 화면 좌표의 거울을 되돌린다: 화면 x = (1 - 이미지 x) * aspect
    return { x: 1 - (cx + (rx * sw) / aspect), y: cy + ry * sw * 0.75 * aspect, visibility: 0.99 };
  };
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  lm[0] = img(pose.head);
  lm[11] = img([-0.5, 0]); lm[12] = img([0.5, 0]);
  lm[15] = img(pose.lw); lm[16] = img(pose.rw);
  lm[13] = img([(-0.5 + pose.lw[0]) / 2 - 0.15, pose.lw[1] / 2 + 0.1]);
  lm[14] = img([(0.5 + pose.rw[0]) / 2 + 0.15, pose.rw[1] / 2 + 0.1]);
  lm[23] = img([-0.38 - pose.lean * 0.5, 2.6]); lm[24] = img([0.38 - pose.lean * 0.5, 2.6]);
  return lm;
}
export const SIM_ASPECT = 4 / 3;
export const SIM_TOTAL = TOTAL;

