import { FaceRenderer, expressions, type Expression, type FaceState } from './character/face-renderer';
import { FpsMeter } from './app/fps-meter';
import { toFaceGazeTarget, type FaceTrackingInput } from './vision/face-tracking-input';
import { MediaPipeFaceTracker } from './vision/media-pipe-face-tracker';
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
let trackingActive = false;
let trackingStarting = false;
let trackingSawFace = false;
let reacquiredIdleTimer = 0;
const fpsMeter = new FpsMeter();

const debugPanel = document.querySelector<HTMLElement>('#debug')!;
const minimizeDebugButton = document.querySelector<HTMLButtonElement>('#minimize-debug')!;
const mouthSlider = document.querySelector<HTMLInputElement>('#mouth')!;
const talkButton = document.querySelector<HTMLButtonElement>('#talk-toggle')!;
const fpsOutput = document.querySelector<HTMLOutputElement>('#fps')!;
const trackingStartButton = document.querySelector<HTMLButtonElement>('#tracking-start')!;
const trackingStopButton = document.querySelector<HTMLButtonElement>('#tracking-stop')!;
const trackingStatus = document.querySelector<HTMLOutputElement>('#tracking-status')!;

function onFaceTrackingInput(input: FaceTrackingInput): void {
  if (!trackingActive) return;
  if (!input.faceDetected) {
    trackingSawFace = false;
    targetGazeX = 0;
    targetGazeY = 0;
    window.clearTimeout(reacquiredIdleTimer);
    setExpression('SEARCH');
    trackingStatus.value = '顔を探しています…';
    return;
  }

  const gaze = toFaceGazeTarget(input);
  targetGazeX = gaze.x;
  targetGazeY = gaze.y;
  trackingStatus.value = `顔を追跡中（視線 ${gaze.x.toFixed(1)}, ${gaze.y.toFixed(1)} / 信頼度 ${Math.round(input.confidence * 100)}%）`;
  if (!trackingSawFace) {
    trackingSawFace = true;
    setExpression('HAPPY');
    window.clearTimeout(reacquiredIdleTimer);
    reacquiredIdleTimer = window.setTimeout(() => {
      if (trackingActive && trackingSawFace) setExpression('IDLE');
    }, 1000);
  }
}

const faceTracker = new MediaPipeFaceTracker(onFaceTrackingInput, (message) => {
  trackingStatus.value = message;
});

function updateTrackingButtons(): void {
  trackingStartButton.disabled = trackingStarting || trackingActive;
  trackingStopButton.disabled = !trackingStarting && !trackingActive;
}

async function startFaceTracking(): Promise<void> {
  if (!debug || trackingStarting || trackingActive) return;
  trackingStarting = true;
  updateTrackingButtons();
  try {
    const started = await faceTracker.start();
    trackingActive = started;
    trackingSawFace = false;
    if (!started) trackingStatus.value = '顔追跡を停止しました';
  } catch (error) {
    trackingActive = false;
    const name = error instanceof DOMException ? error.name : '';
    const message = name === 'NotAllowedError'
      ? 'カメラの使用が許可されませんでした。Safariのサイト設定をご確認ください。'
      : name === 'NotFoundError'
        ? '利用できるカメラが見つかりませんでした。'
        : name === 'NotReadableError'
          ? 'カメラを起動できませんでした。他のアプリが使用していないかご確認ください。'
          : error instanceof Error ? error.message : 'カメラを起動できませんでした';
    trackingStatus.value = message;
  } finally {
    trackingStarting = false;
    updateTrackingButtons();
  }
}

async function stopFaceTracking(): Promise<void> {
  if (!trackingStarting && !trackingActive) return;
  trackingActive = false;
  trackingSawFace = false;
  window.clearTimeout(reacquiredIdleTimer);
  targetGazeX = 0;
  targetGazeY = 0;
  setExpression('IDLE');
  await faceTracker.stop();
  trackingStatus.value = '顔追跡は停止中です';
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
  if (!value) void stopFaceTracking();
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
  if ((!debug || trackingActive) && state.expression === 'SEARCH') gazeX = Math.sin(now / 620) * 0.84;
  if (!debug && state.expression === 'THINK') {
    gazeX = 0.24 + Math.sin(now / 1500) * 0.15;
    gazeY = -0.14;
  }
  state.gazeX += (gazeX - state.gazeX) * Math.min(1, dt * 5);
  state.gazeY += (gazeY - state.gazeY) * Math.min(1, dt * 5);
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
  if (fps !== null) fpsOutput.value = `FPS: ${fps}`;
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
trackingStartButton.addEventListener('click', () => { void startFaceTracking(); });
trackingStopButton.addEventListener('click', () => { void stopFaceTracking(); });
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
    void stopFaceTracking();
  }
});
window.addEventListener('pagehide', () => { void stopFaceTracking(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/ouchi-colon/sw.js', { scope: '/ouchi-colon/' }).then(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) location.reload();
    });
  });
}

requestAnimationFrame(frame);
