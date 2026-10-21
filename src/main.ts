import { FaceRenderer, expressions, type Expression, type FaceState } from './character/face-renderer';
import { FpsMeter } from './app/fps-meter';
import { FaceTrackingStabilizer, smoothGaze, toFaceGazeTarget, type FaceTrackingInput } from './vision/face-tracking-input';
import { MediaPipeFaceTracker, type FaceTrackerMetrics } from './vision/media-pipe-face-tracker';
import { cameraFailureMessage, detectorFailureMessage } from './vision/tracking-errors';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#face');
if (!canvas) throw new Error('Face canvas is missing');

const renderer = new FaceRenderer(canvas);
const state: FaceState = { expression: 'IDLE', gazeX: 0, gazeY: 0, mouthOpen: 0, blink: 0, transition: 1 };
let targetGazeX = 0;
let targetGazeY = 0;
let talking = false;
let debug = new URLSearchParams(location.search).has('debug');
let nextBlink = performance.now() + 2200 + Math.random() * 3500;
let lastFrame = performance.now();
let lastDraw = 0;
let cameraActive = false;
let detectorActive = false;
let trackingStarting = false;
let trackingSawFace = false;
let reacquiredIdleTimer = 0;
const fpsMeter = new FpsMeter();
const faceStabilizer = new FaceTrackingStabilizer();
let detectionFps = 0;
let detectionLatencyMs = 0;

const debugPanel = document.querySelector<HTMLElement>('#debug')!;
const minimizeDebugButton = document.querySelector<HTMLButtonElement>('#minimize-debug')!;
const mouthSlider = document.querySelector<HTMLInputElement>('#mouth')!;
const talkButton = document.querySelector<HTMLButtonElement>('#talk-toggle')!;
const fpsOutput = document.querySelector<HTMLOutputElement>('#fps')!;
const cameraStartButton = document.querySelector<HTMLButtonElement>('#camera-start')!;
const cameraStopButton = document.querySelector<HTMLButtonElement>('#camera-stop')!;
const detectorStartButton = document.querySelector<HTMLButtonElement>('#detector-start')!;
const detectorStopButton = document.querySelector<HTMLButtonElement>('#detector-stop')!;
const trackingStatus = document.querySelector<HTMLOutputElement>('#tracking-status')!;
const trackingCoordinates = document.querySelector<HTMLOutputElement>('#tracking-coordinates')!;
const mirrorHorizontal = document.querySelector<HTMLInputElement>('#mirror-horizontal')!;

function renderTrackingStatus(detail: string): void {
  trackingStatus.value = `カメラ ${cameraActive ? 'ON' : 'OFF'} / 検出 ${detectorActive ? 'ON' : 'OFF'} / ${detail}`;
}

function onFaceTrackingInput(input: FaceTrackingInput): void {
  if (!detectorActive) return;
  const stableInput = faceStabilizer.update(input);
  if (!stableInput.faceDetected) {
    trackingSawFace = false;
    targetGazeX = 0;
    targetGazeY = 0;
    window.clearTimeout(reacquiredIdleTimer);
    setExpression('SEARCH');
    trackingCoordinates.value = `顔座標: -- / 視線 ${state.gazeX.toFixed(2)}, ${state.gazeY.toFixed(2)}`;
    renderTrackingStatus('顔を探しています');
    return;
  }

  const gaze = toFaceGazeTarget(stableInput, mirrorHorizontal.checked);
  targetGazeX = gaze.x;
  targetGazeY = gaze.y;
  trackingCoordinates.value = `顔座標: X ${stableInput.normalizedX.toFixed(2)} / Y ${stableInput.normalizedY.toFixed(2)} / 視線 ${state.gazeX.toFixed(2)}, ${state.gazeY.toFixed(2)}`;
  renderTrackingStatus(`顔を追跡中・信頼度 ${Math.round(stableInput.confidence * 100)}%`);
  if (!trackingSawFace) {
    trackingSawFace = true;
    setExpression('HAPPY');
    window.clearTimeout(reacquiredIdleTimer);
    reacquiredIdleTimer = window.setTimeout(() => {
      if (detectorActive && trackingSawFace) setExpression('IDLE');
    }, 1000);
  }
}

const faceTracker = new MediaPipeFaceTracker(
  onFaceTrackingInput,
  (message) => {
    if (message.startsWith('顔検出でエラー')) {
      detectorActive = false;
      trackingSawFace = false;
      targetGazeX = 0;
      targetGazeY = 0;
      setExpression('SEARCH');
      updateTrackingButtons();
    }
    trackingStatus.value = message;
  },
  (metrics: FaceTrackerMetrics) => {
    detectionFps = metrics.detectionFps;
    detectionLatencyMs = metrics.detectionLatencyMs;
  },
);

function updateTrackingButtons(): void {
  cameraStartButton.disabled = trackingStarting || cameraActive;
  cameraStopButton.disabled = !cameraActive;
  detectorStartButton.disabled = trackingStarting || detectorActive;
  detectorStopButton.disabled = trackingStarting || !detectorActive;
}

async function startCamera(): Promise<void> {
  if (!debug || trackingStarting || cameraActive) return;
  trackingStarting = true;
  updateTrackingButtons();
  try {
    cameraActive = await faceTracker.startCamera();
    faceStabilizer.reset();
    renderTrackingStatus('カメラ映像は画面に表示されません');
  } catch (error) {
    cameraActive = false;
    trackingStatus.value = cameraFailureMessage(error);
  } finally {
    trackingStarting = false;
    updateTrackingButtons();
  }
}

async function startDetection(): Promise<void> {
  if (!debug || trackingStarting || detectorActive) return;
  trackingStarting = true;
  updateTrackingButtons();
  try {
    if (!cameraActive) cameraActive = await faceTracker.startCamera();
    detectorActive = await faceTracker.startDetection();
    faceStabilizer.reset();
    trackingSawFace = false;
  } catch (error) {
    detectorActive = false;
    trackingStatus.value = error instanceof DOMException ? cameraFailureMessage(error) : detectorFailureMessage(error);
  } finally {
    trackingStarting = false;
    updateTrackingButtons();
  }
}

async function stopDetection(): Promise<void> {
  if (!detectorActive) return;
  detectorActive = false;
  trackingSawFace = false;
  window.clearTimeout(reacquiredIdleTimer);
  targetGazeX = 0;
  targetGazeY = 0;
  setExpression('IDLE');
  faceStabilizer.reset();
  await faceTracker.stopDetection();
  renderTrackingStatus('検出を停止しました');
  trackingCoordinates.value = '顔座標: --';
  updateTrackingButtons();
}

async function stopCamera(): Promise<void> {
  if (!cameraActive && !detectorActive) return;
  detectorActive = false;
  cameraActive = false;
  trackingSawFace = false;
  window.clearTimeout(reacquiredIdleTimer);
  targetGazeX = 0;
  targetGazeY = 0;
  faceStabilizer.reset();
  setExpression('IDLE');
  await faceTracker.stopCamera();
  renderTrackingStatus('顔アニメーションは継続中です');
  trackingCoordinates.value = '顔座標: --';
  updateTrackingButtons();
}

function setExpression(expression: Expression): void {
  if (state.expression === expression) return;
  state.expression = expression;
  state.transition = 0;
  if (expression !== 'TALK') talking = false;
}

function setDebug(value: boolean): void {
  debug = value;
  debugPanel.hidden = !value;
  document.body.classList.toggle('debug-on', value);
  if (!value) void stopCamera();
}

function buildDebugControls(): void {
  const root = document.querySelector<HTMLElement>('#expressions')!;
  expressions.forEach((expression, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${index + 1} ${expression}`;
    button.addEventListener('click', () => setExpression(expression));
    root.append(button);
  });
}

function frame(now: number): void {
  if (now - lastDraw < 1000 / 30) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  lastDraw = now;
  let gazeX = targetGazeX;
  let gazeY = targetGazeY;
  if ((!debug || !detectorActive) && state.expression === 'SEARCH') gazeX = Math.sin(now / 620) * 0.84;
  if (!debug && state.expression === 'THINK') {
    gazeX = 0.24 + Math.sin(now / 1500) * 0.15;
    gazeY = -0.14;
  }
  state.gazeX = smoothGaze(state.gazeX, gazeX, dt);
  state.gazeY = smoothGaze(state.gazeY, gazeY, dt);
  state.transition = Math.min(1, state.transition + dt * 5);
  if (!debug && now > nextBlink) {
    state.blink = 1;
    nextBlink = now + 2400 + Math.random() * 3900;
  }
  state.blink = Math.max(0, state.blink - dt * 4);
  if (talking && state.expression === 'TALK') {
    state.mouthOpen = 0.12 + (Math.sin(now / 115) + 1) * 0.31;
  } else if (!debug) {
    state.mouthOpen += (0 - state.mouthOpen) * Math.min(1, dt * 7);
  }
  renderer.draw(state, now);
  const fps = fpsMeter.addFrame(now);
  if (fps !== null) fpsOutput.value = `描画 ${fps} FPS / 検出 ${detectionFps.toFixed(1)} FPS / 遅延 ${detectionLatencyMs} ms`;
  if (debug && detectorActive) {
    trackingCoordinates.value = `顔座標: ${trackingCoordinates.value.replace(/^顔座標: /, '').split(' / 視線')[0]} / 視線 ${state.gazeX.toFixed(2)}, ${state.gazeY.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}

buildDebugControls();
setDebug(debug);
document.querySelector('#close-debug')!.addEventListener('click', () => setDebug(false));
minimizeDebugButton.addEventListener('click', () => {
  const minimized = debugPanel.classList.toggle('debug--minimized');
  minimizeDebugButton.textContent = minimized ? '設定' : '顔を見る';
  minimizeDebugButton.setAttribute('aria-label', minimized ? '設定パネルを開く' : '顔を見やすくする');
});
cameraStartButton.addEventListener('click', () => { void startCamera(); });
cameraStopButton.addEventListener('click', () => { void stopCamera(); });
detectorStartButton.addEventListener('click', () => { void startDetection(); });
detectorStopButton.addEventListener('click', () => { void stopDetection(); });
updateTrackingButtons();
document.querySelector('#gaze-left')!.addEventListener('click', () => { targetGazeX = -1; });
document.querySelector('#gaze-center')!.addEventListener('click', () => { targetGazeX = 0; targetGazeY = 0; });
document.querySelector('#gaze-right')!.addEventListener('click', () => { targetGazeX = 1; });
document.querySelector('#blink-once')!.addEventListener('click', () => {
  state.blink = 1;
  nextBlink = performance.now() + 2400 + Math.random() * 3900;
});
talkButton.addEventListener('click', () => {
  talking = !talking;
  setExpression(talking ? 'TALK' : 'IDLE');
  talkButton.setAttribute('aria-pressed', String(talking));
});
mouthSlider.addEventListener('input', () => { state.mouthOpen = Number(mouthSlider.value); });

window.addEventListener('keydown', (event) => {
  if ((event.key === 'd' || event.key === 'D') && !event.repeat) setDebug(!debug);
  if (!debug) return;
  const index = Number(event.key) - 1;
  if (index >= 0 && index < expressions.length) setExpression(expressions[index]);
  if (event.key === 'ArrowLeft') targetGazeX = -1;
  if (event.key === 'ArrowRight') targetGazeX = 1;
  if (event.key === 'ArrowDown') targetGazeX = 0;
  if (event.code === 'Space') {
    event.preventDefault();
    if (event.repeat) return;
    talking = !talking;
    setExpression(talking ? 'TALK' : 'IDLE');
  }
});

canvas.addEventListener('pointerdown', () => {
  if (debug) return;
  setExpression('HAPPY');
  window.setTimeout(() => setExpression('IDLE'), 1300);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    talking = false;
    void stopCamera();
  }
});
window.addEventListener('pagehide', () => { void stopCamera(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/ouchi-colon/sw.js', { scope: '/ouchi-colon/' }).then(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) location.reload();
    });
  });
}

requestAnimationFrame(frame);
