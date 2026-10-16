import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './features';

const BASE = import.meta.env.BASE_URL;
const LOCAL_WASM = `${BASE}mediapipe/wasm`;
const LOCAL_MODEL = `${BASE}models/pose_landmarker_lite.task`;
const REMOTE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

// 웹캠 + MediaPipe Pose Landmarker. 영상은 화면에 붙이지 않고 분석에만 쓰며,
// 추론은 브라우저 안(WASM/WebGL)에서 끝나므로 프레임이 외부로 나가지 않는다.
export class PoseSource {
  onPose: (lm: Landmark[] | null, aspect: number, t: number) => void = () => {};
  private video = document.createElement('video');
  private running = false;
  private lastVideoT = -1;

  private constructor(private lmk: PoseLandmarker, private stream: MediaStream) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = stream;
    // 일부 브라우저는 문서 밖 비디오의 프레임 콜백을 멈추므로 보이지 않게 붙여 둔다
    Object.assign(this.video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    document.body.appendChild(this.video);
  }

  /** 카메라 권한 요청 → 모델 로드. 실패하면 예외(권한 거부 포함). */
  static async create(): Promise<PoseSource> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
    });
    const files = await FilesetResolver.forVisionTasks(LOCAL_WASM).catch(() => FilesetResolver.forVisionTasks(REMOTE_WASM));
    const tries: [string, 'GPU' | 'CPU'][] = [[LOCAL_MODEL, 'GPU'], [LOCAL_MODEL, 'CPU'], [REMOTE_MODEL, 'GPU'], [REMOTE_MODEL, 'CPU']];
    let last: unknown;
    for (const [model, delegate] of tries) {
      try {
        const lmk = await PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return new PoseSource(lmk, stream);
      } catch (e) { last = e; }
    }
    stream.getTracks().forEach(t => t.stop());
    throw last;
  }

  async start() {
    await this.video.play();
    this.running = true;
    this.loop();
  }

  // 새 영상 프레임이 들어올 때만 추론한다(렌더 루프와 분리). 최대 ~30Hz.
  private loop = () => {
    if (!this.running) return;
    const v = this.video;
    const t = performance.now();
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoT) {
      this.lastVideoT = v.currentTime;
      const res = this.lmk.detectForVideo(v, t);
      this.onPose(res.landmarks[0] ?? null, v.videoWidth / v.videoHeight, t);
    }
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(this.loop);
    else setTimeout(this.loop, 33);
  };

  stop() {
    this.running = false;
    this.stream.getTracks().forEach(t => t.stop());
    this.lmk.close();
    this.video.remove();
  }
}
