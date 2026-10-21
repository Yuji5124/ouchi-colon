import assert from 'node:assert/strict';
import test from 'node:test';
import { FaceTrackingStabilizer, smoothGaze, toFaceGazeTarget, toFaceTrackingInput, type FaceTrackingInput } from '../src/vision/face-tracking-input.ts';

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
  }, false);
  const edgeMove = toFaceGazeTarget({
    faceDetected: true, normalizedX: 1, normalizedY: -1, confidence: 0.9, timestamp: 11,
  }, false);
  assert.ok(Math.abs(slightMove.x - 0.6) < 0.000001);
  assert.ok(Math.abs(slightMove.y + 0.4) < 0.000001);
  assert.deepEqual(edgeMove, { x: 1, y: -1 });
});

const faceAt = (x: number, timestamp: number, y = 0): FaceTrackingInput => ({
  faceDetected: true, normalizedX: x, normalizedY: y, confidence: 0.9, timestamp,
});

test('maps a face on the left and right to gaze in the matching directions', () => {
  assert.ok(toFaceGazeTarget(faceAt(-0.3, 1), false).x < 0);
  assert.ok(toFaceGazeTarget(faceAt(0.3, 2), false).x > 0);
});

test('keeps gaze centered for a face near the center', () => {
  assert.deepEqual(toFaceGazeTarget(faceAt(0.02, 1, -0.03)), { x: 0, y: 0 });
});

test('horizontal mirroring reverses the gaze direction', () => {
  assert.ok(toFaceGazeTarget(faceAt(0.3, 1), true).x < 0);
  assert.ok(toFaceGazeTarget(faceAt(0.3, 1), false).x > 0);
  assert.ok(toFaceGazeTarget(faceAt(0.3, 1)).x < 0, 'front-camera default mirrors the horizontal position');
});

test('stabilizes acquisition, tolerates a short miss, then returns to no-face', () => {
  const stabilizer = new FaceTrackingStabilizer();
  assert.equal(stabilizer.update(faceAt(0.4, 0)).faceDetected, false);
  assert.equal(stabilizer.update(faceAt(0.4, 200)).faceDetected, true);
  assert.equal(stabilizer.update({ ...faceAt(0, 250), faceDetected: false }).faceDetected, true);
  assert.equal(stabilizer.update({ ...faceAt(0, 650), faceDetected: false }).faceDetected, false);
});

test('reacquires after a stable loss', () => {
  const stabilizer = new FaceTrackingStabilizer();
  stabilizer.update(faceAt(0, 0));
  assert.equal(stabilizer.update(faceAt(0, 200)).faceDetected, true);
  assert.equal(stabilizer.update({ ...faceAt(0, 700), faceDetected: false }).faceDetected, false);
  assert.equal(stabilizer.update(faceAt(-0.3, 800)).faceDetected, false);
  assert.equal(stabilizer.update(faceAt(-0.3, 1000)).faceDetected, true);
});

test('smoothly interpolates gaze instead of jumping to the target', () => {
  const firstFrame = smoothGaze(0, 1, 1 / 30);
  assert.ok(firstFrame > 0 && firstFrame < 1);
  assert.ok(smoothGaze(firstFrame, 1, 1 / 30) > firstFrame);
  assert.equal(smoothGaze(0.5, 0, 0), 0.5);
});
