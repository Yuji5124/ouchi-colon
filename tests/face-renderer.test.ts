import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FACE_LAYOUT,
  FACE_ASSET_PATHS,
  FaceRenderer,
  expressions,
  type FaceState,
} from '../src/character/face-renderer.ts';
import { FpsMeter } from '../src/app/fps-meter.ts';

type DrawCall = { image: { url: string }; alpha: number; x: number; y: number };

class FakeContext {
  globalAlpha = 1;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  calls: DrawCall[] = [];
  translations: Array<[number, number]> = [];
  ellipseCount = 0;
  strokeCount = 0;
  private alphaStack: number[] = [];
  setTransform(): void {}
  fillRect(): void {}
  save(): void { this.alphaStack.push(this.globalAlpha); }
  restore(): void { this.globalAlpha = this.alphaStack.pop() ?? 1; }
  translate(x: number, y: number): void { this.translations.push([x, y]); }
  scale(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  quadraticCurveTo(): void {}
  bezierCurveTo(): void {}
  ellipse(): void { this.ellipseCount += 1; }
  arc(): void {}
  fill(): void {}
  stroke(): void { this.strokeCount += 1; }
  clip(): void {}
  createRadialGradient(): { addColorStop(): void } { return { addColorStop() {} }; }
  drawImage(image: { url: string }, x: number, y: number): void {
    this.calls.push({ image, alpha: this.globalAlpha, x, y });
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly context = new FakeContext();
  bounds = { width: 1792, height: 828 };
  getContext(): FakeContext { return this.context; }
  getBoundingClientRect(): { width: number; height: number } { return this.bounds; }
}

let onResize: (() => void) | null = null;
function installCanvasGlobals(dpr = 1): void {
  onResize = null;
  Object.assign(globalThis, {
    window: { devicePixelRatio: dpr },
    ResizeObserver: class {
      constructor(callback: () => void) { onResize = callback; }
      observe(): void {}
    },
  });
}

async function createRenderer(loader = async (url: string) => ({ url } as unknown as CanvasImageSource)) {
  installCanvasGlobals();
  const canvas = new FakeCanvas();
  const renderer = new FaceRenderer(
    canvas as unknown as HTMLCanvasElement,
    DEFAULT_FACE_LAYOUT,
    'https://assets.test/face/',
    loader,
  );
  await renderer.assetsReady;
  return { renderer, canvas };
}

const state = (overrides: Partial<FaceState> = {}): FaceState => ({
  expression: 'IDLE', gazeX: 0, gazeY: 0, mouthOpen: 0, blink: 0, transition: 1, ...overrides,
});

test('eight expressions render their image variations', async () => {
  const { renderer, canvas } = await createRenderer();
  for (const expression of expressions) {
    canvas.context.calls = [];
    renderer.draw(state({ expression }), 1200);
    assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/backgrounds/cream.png')));
    if (expression === 'SAD') assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/mouths/sad.png')));
    if (expression === 'SURPRISE') assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/mouths/surprise.png')));
    if (expression === 'SLEEP') assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/eyes/closed.png')));
    if (expression === 'HAPPY') assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/eyes/happy.png')));
  }
});

test('blink switches between independent open and closed eye PNGs', async () => {
  const { renderer, canvas } = await createRenderer();
  renderer.draw(state(), 1000);
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/eyes/open.png') && call.alpha > 0.9));
  canvas.context.calls = [];
  renderer.draw(state({ blink: 1 }), 1100);
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/eyes/closed.png') && call.alpha > 0.9));
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/eyes/open.png') && call.alpha < 0.01));
});

test('talk mouth blends closed and open PNGs according to mouth amount', async () => {
  const { renderer, canvas } = await createRenderer();
  renderer.draw(state({ expression: 'TALK', mouthOpen: 0 }), 1000);
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/mouths/closed.png') && call.alpha > 0.9));
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/mouths/open.png') && call.alpha < 0.01));
  canvas.context.calls = [];
  renderer.draw(state({ expression: 'TALK', mouthOpen: 1 }), 1100);
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/mouths/open.png') && call.alpha > 0.9));
});

test('gaze input translates the independent highlight layer', async () => {
  const { renderer, canvas } = await createRenderer();
  renderer.draw(state({ gazeX: 0.8, gazeY: -0.4 }), 1000);
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/eyes/highlight.png')));
  assert.ok(canvas.context.translations.some(([x, y]) => Math.abs(x - 35.52) < 0.0001 && Math.abs(y + 16.44) < 0.0001));
});

test('missing images fall back to Canvas drawing without throwing', async () => {
  const { renderer, canvas } = await createRenderer(async () => null);
  assert.doesNotThrow(() => renderer.draw(state({ expression: 'SURPRISE', blink: 0.5 }), 1000));
  assert.equal(canvas.context.calls.length, 0);
  assert.ok(canvas.context.ellipseCount > 0);
});

test('one failed expression PNG falls back while the remaining images keep rendering', async () => {
  const { renderer, canvas } = await createRenderer(async (url) => (
    url.endsWith('/mouths/sad.png') ? null : { url } as unknown as CanvasImageSource
  ));
  renderer.draw(state({ expression: 'SAD' }), 1000);
  assert.ok(canvas.context.calls.some((call) => call.image.url.endsWith('/eyes/open.png')));
  assert.ok(canvas.context.strokeCount > 0, 'sad mouth uses its Canvas fallback');
});

test('committed face assets are valid PNG files', async () => {
  for (const relativePath of Object.values(FACE_ASSET_PATHS)) {
    const path = fileURLToPath(new URL(`../public/assets/face/${relativePath}`, import.meta.url));
    const data = await readFile(path);
    assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0, `${relativePath} has dimensions`);
  }
});

test('FPS meter reports measured render cadence', () => {
  const meter = new FpsMeter();
  assert.equal(meter.addFrame(0), null);
  let result: number | null = null;
  for (let frame = 1; frame <= 30; frame += 1) result = meter.addFrame(frame * (1000 / 30));
  assert.equal(result, 30);
});

test('canvas backing store is resized and caps device pixel ratio on rotation', async () => {
  installCanvasGlobals(3);
  const canvas = new FakeCanvas();
  const renderer = new FaceRenderer(
    canvas as unknown as HTMLCanvasElement,
    DEFAULT_FACE_LAYOUT,
    'https://assets.test/face/',
    async (url) => ({ url } as unknown as CanvasImageSource),
  );
  await renderer.assetsReady;
  canvas.bounds = { width: 828, height: 1792 };
  onResize?.();
  assert.equal(canvas.width, 1656);
  assert.equal(canvas.height, 3584);
});
