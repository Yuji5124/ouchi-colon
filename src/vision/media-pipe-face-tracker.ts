import type { FaceDetector } from '@mediapipe/tasks-vision';
import { toFaceTrackingInput, type FaceTrackingInput } from './face-tracking-input.ts';

const MEDIAPIPE_VERSION = '1.1.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const DETECTION_INTERVAL_MS = 200;
type VisionModule = typeof import('@mediapipe/tasks-vision');

export function loadMediaPipeVision(loader: () => Promise<VisionModule> = () => import('@mediapipe/tasks-vision')): Promise<VisionModule> {
  return loader();
}

export interface FaceTrackerMetrics {
  detectionFps: number;
  detectionLatencyMs: number;
}

export class MediaPipeFaceTracker {
  private readonly onInput: (input: FaceTrackingInput) => void;
  private readonly onStatus: (message: string) => void;
  private readonly onMetrics: (metrics: FaceTrackerMetrics) => void;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private detector: FaceDetector | null = null;
  private timer: number | null = null;
  private detectionRunning = false;
  private generation = 0;
  private lastCompletedAt: number | null = null;

  constructor(
    onInput: (input: FaceTrackingInput) => void,
    onStatus: (message: string) => void,
    onMetrics: (metrics: FaceTrackerMetrics) => void = () => undefined,
  ) {
    this.onInput = onInput;
    this.onStatus = onStatus;
    this.onMetrics = onMetrics;
  }

  get cameraOn(): boolean { return Boolean(this.stream); }
  get detectorOn(): boolean { return this.detectionRunning; }

  async startCamera(): Promise<boolean> {
    if (this.stream && this.video) return true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('このブラウザーでは安全なカメラ接続を利用できません。HTTPSのSafariをお使いください。');
    }

    this.onStatus('前面カメラを起動しています…');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640, max: 960 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 15, max: 30 },
      },
    });
    this.stream = stream;

    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.className = 'camera-source';
    video.srcObject = stream;
    document.body.append(video);
    this.video = video;

    try {
      await video.play();
      this.onStatus('カメラON。映像は画面に表示せず、端末内で処理します。');
      return true;
    } catch (error) {
      await this.stopCamera();
      throw error;
    }
  }

  async startDetection(): Promise<boolean> {
    if (this.detectionRunning) return true;
    if (!this.stream || !this.video) await this.startCamera();

    const generation = ++this.generation;
    const { FaceDetector, FilesetResolver } = await loadMediaPipeVision();
    this.onStatus('顔検出モデルを準備しています… 初回は約15 MBをダウンロードします。');
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
      minSuppressionThreshold: 0.3,
    });
    if (generation !== this.generation || !this.stream || !this.video) {
      detector.close();
      return false;
    }
    this.detector = detector;
    this.detectionRunning = true;
    this.lastCompletedAt = null;
    this.onStatus('顔検出ON。顔を探しています…');
    this.detectFrame();
    return true;
  }

  async stopDetection(): Promise<void> {
    this.generation += 1;
    this.detectionRunning = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.detector?.close();
    this.detector = null;
    this.lastCompletedAt = null;
    this.onMetrics({ detectionFps: 0, detectionLatencyMs: 0 });
    this.onInput({ faceDetected: false, normalizedX: 0, normalizedY: 0, confidence: 0, timestamp: performance.now() });
  }

  async stopCamera(): Promise<void> {
    await this.stopDetection();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video?.pause();
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
    }
    this.video = null;
    this.onStatus('カメラOFF。顔アニメーションは継続中です。');
  }

  /** Compatibility helper for callers wanting camera and detection in one explicit action. */
  async start(): Promise<boolean> {
    await this.startCamera();
    return this.startDetection();
  }

  async stop(): Promise<void> {
    await this.stopCamera();
  }

  private detectFrame(): void {
    if (!this.detectionRunning || !this.video || !this.detector) return;
    const startedAt = performance.now();
    const video = this.video;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        const result = this.detector.detectForVideo(video, startedAt);
        const detection = result.detections
          .map((candidate) => ({
            box: candidate.boundingBox,
            confidence: Math.max(0, ...candidate.categories.map((category) => category.score)),
          }))
          .filter((candidate) => candidate.box)
          .sort((a, b) => b.confidence - a.confidence)[0];
        const completedAt = performance.now();
        const detectionFps = this.lastCompletedAt === null ? 0 : 1000 / Math.max(1, completedAt - this.lastCompletedAt);
        this.lastCompletedAt = completedAt;
        this.onMetrics({ detectionFps: Math.round(detectionFps * 10) / 10, detectionLatencyMs: Math.round(completedAt - startedAt) });
        this.onInput(toFaceTrackingInput(
          detection?.box,
          detection?.confidence ?? 0,
          video.videoWidth,
          video.videoHeight,
          startedAt,
        ));
      } catch {
        void this.stopDetection();
        this.onStatus('顔検出でエラーが発生しました。カメラはONのままです。検出を再開してください。');
        return;
      }
    }
    const elapsed = performance.now() - startedAt;
    this.timer = window.setTimeout(() => this.detectFrame(), Math.max(0, DETECTION_INTERVAL_MS - elapsed));
  }
}
