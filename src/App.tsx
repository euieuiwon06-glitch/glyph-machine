import { useEffect, useRef, useState } from 'react';
import { Poster } from './engine/poster';
import { Composer } from './engine/composer';
import { composeReference } from './engine/reference';
import { toSVG } from './engine/svg';
import { FeatureTracker, type Features } from './motion/features';
import { PoseSource } from './motion/pose';
import { MouseSource } from './motion/mouse';
import { SIM_ASPECT, simLandmarks } from './motion/sim';
import { DebugPanel } from './debug';

// 주소 뒤 옵션(개발용): ?ref 정적 재현 · ?sim[=배속] 가상 몸 · ?mouse 마우스 강제 · ?debug 디버그 패널
const q = new URLSearchParams(location.search);

export function App() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hint, setHint] = useState<string | null>(null);
  // 그림이 완성됐거나(자동 정지) 일시정지했을 때만 SVG 버튼을 보인다
  const [ready, setReady] = useState(false);
  const saveSvgRef = useRef<() => void>(() => {});

  useEffect(() => {
    const poster = new Poster(ref.current!);
    const composer = new Composer(e => poster.add(e));
    const tracker = new FeatureTracker();
    const debug = q.has('debug') ? new DebugPanel() : null;
    let mode = 'wait';
    let features: Features = tracker.f;
    let mouse: MouseSource | null = null;
    let pose: PoseSource | null = null;
    let alive = true;

    if (q.has('ref')) {
      composeReference(e => poster.add(e));
      mode = 'ref';
    } else {
      const useMouse = () => { mouse = new MouseSource((x, y) => poster.toPoster(x, y)); mode = 'mouse'; };
      if (q.has('sim')) mode = 'sim';
      else if (q.has('mouse')) useMouse();
      else PoseSource.create().then(async p => {
        if (!alive) return p.stop();
        pose = p;
        p.onPose = (lm, aspect, t) => {
          features = tracker.update(lm, aspect, t);
          composer.update(features, 1 / 30);
        };
        await p.start();
        mode = 'camera';
      }).catch(err => { console.warn('[camera] unavailable → mouse mode', err); if (alive) useMouse(); });
    }

    // 렌더 루프: 새로 생긴 요소만 덧그린다
    const simSpeed = +(q.get('sim') || 1) || 1;
    const t0 = performance.now();
    let last = t0, raf = 0, shown = false;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (mode === 'sim') {
        // 대본을 배속으로 돌리되 특징 추출은 30Hz 단계로 나눠 실제 카메라와 같게 한다
        const steps = Math.max(1, Math.round(dt * 30 * simSpeed));
        for (let i = 0; i < steps; i++) {
          const tt = ((now - t0) / 1000) * simSpeed - (steps - 1 - i) / 30;
          features = tracker.update(simLandmarks(tt, !q.has('once')), SIM_ASPECT, tt * 1000);
          composer.update(features, 1 / 30);
        }
      } else if (mode === 'mouse' && mouse) {
        features = mouse.update(dt);
        composer.update(features, dt);
      }
      poster.flush();
      const r = composer.done || composer.paused || mode === 'ref';
      if (r !== shown) { shown = r; setReady(r); }
      debug?.draw(features, { els: poster.els.length, ...composer.stats() }, mode + (composer.paused ? ' (paused)' : ''));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // 단축키
    let saveN = 0;
    try { saveN = +(localStorage.getItem('glyph-machine-n') || 0); } catch { /* 저장소 없음 */ }
    let hideT = 0;
    const flash = (msg: string | null, ms = 1800) => {
      setHint(msg ?? (composer.paused ? 'SPACE 재개 · S 저장 · R 초기화' : 'S 저장 · R 초기화 · SPACE 일시정지'));
      clearTimeout(hideT);
      hideT = window.setTimeout(() => setHint(null), ms);
    };
    const onKey = async (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (composer.done) { flash('완성됨 · R 새로 시작', 1400); return; }
        composer.paused = !composer.paused;
        flash(composer.paused ? '일시정지' : '재개', 1000);
      } else if (e.code === 'KeyR') {
        poster.clear();
        if (mode === 'ref') composeReference(x => poster.add(x));
        else composer.reset();
        poster.flush();
      } else if (e.code === 'KeyS') {
        void savePNG();
      }
    };
    const nextName = (ext: string) => {
      saveN++;
      try { localStorage.setItem('glyph-machine-n', String(saveN)); } catch { /* 무시 */ }
      return `GLYPH-MACHINE-${String(saveN).padStart(3, '0')}.${ext}`;
    };
    const download = (blob: Blob, name: string) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      flash(`저장됨 ${name}`, 1400);
    };
    // 둘 다 요소 목록에서 다시 그려 만들기 때문에 버튼·안내 문구는 파일에 들어가지 않는다
    const savePNG = async () => download(await poster.exportPNG(2), nextName('png'));
    saveSvgRef.current = () => download(new Blob([toSVG(poster.els)], { type: 'image/svg+xml' }), nextName('svg'));
    const onMove = () => flash(null);
    const onResize = () => poster.resize();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('resize', onResize);
    Object.assign(window, { __gm: { poster, composer, get features() { return features; }, get mode() { return mode; } } });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      pose?.stop();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} style={{ display: 'block' }} />
      <button
        type="button"
        className="gm-svg"
        aria-label="SVG로 저장"
        onClick={() => saveSvgRef.current()}
        tabIndex={ready ? 0 : -1}
        style={{ opacity: ready ? 1 : 0, pointerEvents: ready ? 'auto' : 'none' }}
      >
        SVG
        <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true">
          <path d="M4.5 0v8.5M1 5.2l3.5 3.5L8 5.2M0.5 10.5h8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <div
        style={{
          position: 'fixed', right: 20, bottom: 16, font: '11px/1 ui-monospace, "SF Mono", Menlo, monospace',
          letterSpacing: '0.04em', color: '#b5b5b5', opacity: hint ? 1 : 0, transition: 'opacity .4s',
          pointerEvents: 'none', userSelect: 'none',
        }}
      >
        {hint}
      </div>
    </>
  );
}
