/** One face position sample emitted by the local camera detector. */
export interface FaceTrackingInput {
  faceDetected: boolean;
  /** Horizontal position in [-1, 1], where -1 is screen-left and 1 is screen-right. */
  normalizedX: number;
  /** Vertical position in [-1, 1], where -1 is screen-top and 1 is screen-bottom. */
  normalizedY: number;
  /** Detector confidence in [0, 1]. */
  confidence: number;
  /** Monotonic time in milliseconds from performance.now(). */
  timestamp: number;
}

export interface FaceDetectionBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface FaceGazeTarget {
  x: number;
  y: number;
}

export interface StabilizedFaceInput extends FaceTrackingInput {}

const MIN_FACE_CONFIDENCE = 0.5;
const GAZE_GAIN_X = 3;
const GAZE_GAIN_Y = 2;
const GAZE_DEAD_ZONE = 0.035;
const ACQUIRE_SAMPLES = 2;
const LOST_GRACE_MS = 400;

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** Amplifies small camera movements enough to be visible in the eye highlights. */
export function toFaceGazeTarget(input: FaceTrackingInput, mirrorHorizontal = false): FaceGazeTarget {
  if (!input.faceDetected) return { x: 0, y: 0 };
  const horizontal = mirrorHorizontal ? -input.normalizedX : input.normalizedX;
  const deadZone = (value: number) => Math.abs(value) < GAZE_DEAD_ZONE ? 0 : value;
  return {
    x: clampUnit(deadZone(horizontal) * GAZE_GAIN_X),
    y: clampUnit(deadZone(input.normalizedY) * GAZE_GAIN_Y),
  };
}

/** Filters one-frame false negatives and requires two samples before acquiring a face. */
export class FaceTrackingStabilizer {
  private stable = false;
  private acquiredSamples = 0;
  private lastSeenAt = Number.NEGATIVE_INFINITY;
  private lastInput: FaceTrackingInput = { faceDetected: false, normalizedX: 0, normalizedY: 0, confidence: 0, timestamp: 0 };

  update(input: FaceTrackingInput): StabilizedFaceInput {
    if (input.faceDetected) {
      this.acquiredSamples += 1;
      this.lastSeenAt = input.timestamp;
      this.lastInput = input;
      if (this.acquiredSamples >= ACQUIRE_SAMPLES) this.stable = true;
      return { ...input, faceDetected: this.stable };
    }

    this.acquiredSamples = 0;
    if (this.stable && input.timestamp - this.lastSeenAt < LOST_GRACE_MS) {
      return { ...this.lastInput, timestamp: input.timestamp, faceDetected: true };
    }

    this.stable = false;
    return { ...input, faceDetected: false, normalizedX: 0, normalizedY: 0, confidence: 0 };
  }

  reset(): void {
    this.stable = false;
    this.acquiredSamples = 0;
    this.lastSeenAt = Number.NEGATIVE_INFINITY;
    this.lastInput = { faceDetected: false, normalizedX: 0, normalizedY: 0, confidence: 0, timestamp: 0 };
  }
}

/** Exponential interpolation keeps the rendered gaze smooth across 5 FPS samples. */
export function smoothGaze(current: number, target: number, deltaSeconds: number, rate = 7): number {
  const dt = Math.max(0, Math.min(deltaSeconds, 0.1));
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Converts a MediaPipe bounding box into the app's normalized input contract. */
export function toFaceTrackingInput(
  box: FaceDetectionBox | undefined,
  confidence: number,
  frameWidth: number,
  frameHeight: number,
  timestamp: number,
): FaceTrackingInput {
  const validFrame = Number.isFinite(frameWidth) && Number.isFinite(frameHeight) && frameWidth > 0 && frameHeight > 0;
  const validBox = Boolean(box
    && Number.isFinite(box.originX)
    && Number.isFinite(box.originY)
    && Number.isFinite(box.width)
    && Number.isFinite(box.height)
    && box.width > 0
    && box.height > 0);
  const detected = Boolean(validBox && validFrame && Number.isFinite(confidence) && confidence >= MIN_FACE_CONFIDENCE);
  if (!detected || !box) {
    return { faceDetected: false, normalizedX: 0, normalizedY: 0, confidence: 0, timestamp };
  }

  const centerX = box.originX + box.width / 2;
  const centerY = box.originY + box.height / 2;
  return {
    faceDetected: true,
    normalizedX: clampUnit((centerX / frameWidth) * 2 - 1),
    normalizedY: clampUnit((centerY / frameHeight) * 2 - 1),
    confidence: Math.max(0, Math.min(1, confidence)),
    timestamp,
  };
}
