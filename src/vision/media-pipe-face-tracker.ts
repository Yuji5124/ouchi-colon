import type { FaceDetector } from '@mediapipe/tasks-vision';
import { toFaceTrackingInput, type FaceTrackingInput } from './face-tracking-input';

const MEDIAPIPE_VERSION = '1.1.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const DETECTION_INTERVAL_MS = 200;

export class MediaPipeFaceTracker {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private detector: FaceDetector | null = null;
  private timer: number | null = null;
  private running = false;
  private generation = 0;

  constructor(
    private readonly onInput: (input: FaceTrackingInput) => void,
    private readonly onStatus: (message: string) => void,
  ) {}

  async start(): Promise<boolean> {
    if (this.running) return true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('このブラウザーでは安全なカメラ接続を利用できません。HTTPSのSafariをお使いください。');
    }

    const generation = ++this.generation;
    this.onStatus('カメラを起動しています…');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 15, max: 30 },
      },
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
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
      if (generation !== this.generation) return false;
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      this.onStatus('顔検出モデルを準備しています… 初回は約15 MBをダウンロードします。');
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      });
      if (generation !== this.generation) {
        detector.close();
        return false;
      }
      this.detector = detector;
      this.running = true;
      this.onStatus('顔追跡中（最大5回/秒）。映像は端末内で処理し、保存・送信しません。');
      this.detectFrame();
      return true;
    } catch (error) {
      if (generation === this.generation) await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.generation += 1;
    this.running = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.detector?.close();
    this.detector = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video?.pause();
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
    }
    this.video = null;
    this.onInput({ faceDetected: false, normalizedX: 0, normalizedY: 0, confidence: 0, timestamp: performance.now() });
  }

  private detectFrame(): void {
    if (!this.running || !this.video || !this.detector) return;
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
        this.onInput(toFaceTrackingInput(
          detection?.box,
          detection?.confidence ?? 0,
          video.videoWidth,
          video.videoHeight,
          startedAt,
        ));
      } catch {
        void this.stop();
        this.onStatus('顔検出を停止しました。カメラを再起動してください。');
        return;
      }
    }
    const elapsed = performance.now() - startedAt;
    this.timer = window.setTimeout(() => this.detectFrame(), Math.max(0, DETECTION_INTERVAL_MS - elapsed));
  }
}
