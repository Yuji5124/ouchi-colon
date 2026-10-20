/** Normalized face-position sample for the future face-tracking adapter. */
export interface FaceTrackingInput {
  faceDetected: boolean;
  normalizedX: number;
  normalizedY: number;
  confidence: number;
  timestamp: number;
}
