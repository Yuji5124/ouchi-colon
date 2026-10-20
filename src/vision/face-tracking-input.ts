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

const MIN_FACE_CONFIDENCE = 0.5;

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
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
