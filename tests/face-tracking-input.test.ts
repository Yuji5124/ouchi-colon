import assert from 'node:assert/strict';
import test from 'node:test';
import { toFaceGazeTarget, toFaceTrackingInput } from '../src/vision/face-tracking-input.ts';

test('normalizes a centered face to the gaze origin', () => {
  const input = toFaceTrackingInput({ originX: 40, originY: 20, width: 20, height: 20 }, 0.92, 100, 100, 1234);
  assert.deepEqual(input, {
    faceDetected: true,
    normalizedX: 0,
    normalizedY: -0.4,
    confidence: 0.92,
    timestamp: 1234,
  });
});

test('maps left and right face positions to the same screen directions', () => {
  const left = toFaceTrackingInput({ originX: 0, originY: 20, width: 10, height: 10 }, 0.9, 100, 100, 1);
  const right = toFaceTrackingInput({ originX: 90, originY: 20, width: 10, height: 10 }, 0.9, 100, 100, 2);
  assert.ok(Math.abs(left.normalizedX + 0.9) < 0.000001);
  assert.ok(Math.abs(right.normalizedX - 0.9) < 0.000001);
});

test('rejects missing, low-confidence, and invalid face measurements', () => {
  const missing = toFaceTrackingInput(undefined, 0, 100, 100, 1);
  const uncertain = toFaceTrackingInput({ originX: 0, originY: 0, width: 10, height: 10 }, 0.49, 100, 100, 2);
  const invalid = toFaceTrackingInput({ originX: Number.NaN, originY: 0, width: 10, height: 10 }, 0.99, 100, 100, 3);
  assert.equal(missing.faceDetected, false);
  assert.equal(uncertain.faceDetected, false);
  assert.equal(invalid.faceDetected, false);
  assert.deepEqual([missing.normalizedX, missing.normalizedY, missing.confidence], [0, 0, 0]);
});

test('amplifies small face movement and clamps gaze to the eye range', () => {
  const slightMove = toFaceGazeTarget({
    faceDetected: true, normalizedX: 0.2, normalizedY: -0.2, confidence: 0.9, timestamp: 10,
  });
  const edgeMove = toFaceGazeTarget({
    faceDetected: true, normalizedX: 1, normalizedY: -1, confidence: 0.9, timestamp: 11,
  });
  assert.ok(Math.abs(slightMove.x - 0.6) < 0.000001);
  assert.ok(Math.abs(slightMove.y + 0.4) < 0.000001);
  assert.deepEqual(edgeMove, { x: 1, y: -1 });
});
