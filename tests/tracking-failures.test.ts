import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMediaPipeVision, MediaPipeFaceTracker } from '../src/vision/media-pipe-face-tracker.ts';
import { cameraFailureMessage, detectorFailureMessage } from '../src/vision/tracking-errors.ts';

test('camera permission refusal is reported without throwing through the animation app', () => {
  const message = cameraFailureMessage({ name: 'NotAllowedError' });
  assert.match(message, /カメラ権限がありません/);
  assert.match(cameraFailureMessage(new Error('unsupported')), /unsupported/);
});

test('camera startup handles denied permission as a recoverable failure', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } } },
  });
  const tracker = new MediaPipeFaceTracker(() => undefined, () => undefined);
  try {
    await assert.rejects(tracker.startCamera(), /denied/);
    assert.equal(tracker.cameraOn, false);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('MediaPipe library load failures are surfaced for retry', async () => {
  await assert.rejects(
    loadMediaPipeVision(async () => { throw new Error('offline'); }),
    /offline/,
  );
  assert.match(detectorFailureMessage(new Error('offline')), /オンラインで再試行/);
});
