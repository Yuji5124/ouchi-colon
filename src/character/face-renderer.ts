export const expressions = ['IDLE', 'HAPPY', 'TALK', 'THINK', 'SURPRISE', 'SAD', 'SLEEP', 'SEARCH'] as const;
export type Expression = (typeof expressions)[number];

export interface FaceState {
  expression: Expression;
  gazeX: number;
  gazeY: number;
  mouthOpen: number;
  blink: number;
  transition: number;
}

export interface FaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLayout {
  width: number;
  height: number;
  background: FaceRect;
  leftEye: FaceRect;
  rightEye: FaceRect;
  leftCheek: FaceRect;
  rightCheek: FaceRect;
  mouth: FaceRect;
}

export type FaceAssetName =
  | 'background'
  | 'leftCheek'
  | 'rightCheek'
  | 'eyeOpen'
  | 'eyeClosed'
  | 'eyeHappy'
  | 'eyeHighlight'
  | 'mouthOpen'
  | 'mouthClosed'
  | 'mouthSad'
  | 'mouthSurprise';

export type FaceAssetLoader = (url: string) => Promise<CanvasImageSource | null>;

export const DEFAULT_FACE_LAYOUT: FaceLayout = {
  width: 1792,
  height: 828,
  background: { x: 0, y: 0, width: 1792, height: 828 },
  leftEye: { x: 394, y: 223, width: 222, height: 274 },
  rightEye: { x: 1176, y: 223, width: 222, height: 274 },
  leftCheek: { x: 206, y: 449, width: 308, height: 232 },
  rightCheek: { x: 1278, y: 449, width: 308, height: 232 },
  mouth: { x: 716, y: 452, width: 360, height: 260 },
};

export const FACE_ASSET_PATHS: Record<FaceAssetName, string> = {
  background: 'backgrounds/cream.png',
  leftCheek: 'cheeks/left.png',
  rightCheek: 'cheeks/right.png',
  eyeOpen: 'eyes/open.png',
  eyeClosed: 'eyes/closed.png',
  eyeHappy: 'eyes/happy.png',
  eyeHighlight: 'eyes/highlight.png',
  mouthOpen: 'mouths/open.png',
  mouthClosed: 'mouths/closed.png',
  mouthSad: 'mouths/sad.png',
  mouthSurprise: 'mouths/surprise.png',
};

const cream = '#fff4e1';
const brown = '#2c1a12';

function getAssetRoot(): string {
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
  if (!manifest) return `${location.origin}/ouchi-colon/assets/face/`;
  return new URL('assets/face/', new URL('.', manifest)).href;
}

function loadImage(url: string): Promise<CanvasImageSource | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export class FaceRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly layout: FaceLayout;
  private width = 1792;
  private height = 828;
  private dpr = 1;
  private lastExpression: Expression = 'IDLE';
  private previousExpression: Expression = 'IDLE';
  private readonly assets: Partial<Record<FaceAssetName, CanvasImageSource>> = {};
  readonly assetsReady: Promise<void>;

  constructor(
    canvas: HTMLCanvasElement,
    layout: FaceLayout = DEFAULT_FACE_LAYOUT,
    assetRoot = getAssetRoot(),
    assetLoader: FaceAssetLoader = loadImage,
  ) {
    this.canvas = canvas;
    this.layout = layout;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.context = context;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.assetsReady = Promise.all(
      Object.entries(FACE_ASSET_PATHS).map(async ([name, path]) => {
        const url = new URL(path, assetRoot.endsWith('/') ? assetRoot : `${assetRoot}/`).href;
        const image = await Promise.resolve().then(() => assetLoader(url)).catch(() => null);
        if (image) this.assets[name as FaceAssetName] = image;
      }),
    ).then(() => undefined);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  draw(state: FaceState, time: number): void {
    const ctx = this.context;
    const scale = Math.min(this.width / this.layout.width, this.height / this.layout.height);
    const xOffset = (this.width - this.layout.width * scale) / 2;
    const yOffset = (this.height - this.layout.height * scale) / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = cream;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(xOffset, yOffset);
    ctx.scale(scale, scale);
    this.drawBackground(ctx);
    this.drawCheeks(ctx);
    if (state.expression !== this.lastExpression) {
      this.previousExpression = this.lastExpression;
      this.lastExpression = state.expression;
    }
    ctx.save();
    ctx.globalAlpha = 1 - state.transition;
    this.drawEyes(ctx, { ...state, expression: this.previousExpression }, time);
    this.drawMouth(ctx, { ...state, expression: this.previousExpression });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = state.transition;
    this.drawEyes(ctx, state, time);
    this.drawMouth(ctx, state);
    ctx.restore();
    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const { background } = this.layout;
    const image = this.assets.background;
    if (image) {
      this.drawImageAt(ctx, image, background);
      return;
    }
    ctx.fillStyle = cream;
    ctx.fillRect(background.x, background.y, background.width, background.height);
  }

  private drawCheeks(ctx: CanvasRenderingContext2D): void {
    this.drawCheek(ctx, 'leftCheek', this.layout.leftCheek);
    this.drawCheek(ctx, 'rightCheek', this.layout.rightCheek);
  }

  private drawCheek(ctx: CanvasRenderingContext2D, key: 'leftCheek' | 'rightCheek', rect: FaceRect): void {
    const image = this.assets[key];
    if (image) {
      this.drawImageAt(ctx, image, rect);
      return;
    }
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 14, centerX, centerY, rect.width / 2);
    gradient.addColorStop(0, 'rgba(255, 112, 127, 0.43)');
    gradient.addColorStop(0.55, 'rgba(255, 125, 141, 0.24)');
    gradient.addColorStop(1, 'rgba(255, 139, 153, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEyes(ctx: CanvasRenderingContext2D, state: FaceState, time: number): void {
    const required: FaceAssetName[] = ['eyeOpen', 'eyeClosed', 'eyeHappy', 'eyeHighlight'];
    if (required.every((name) => this.assets[name])) {
      this.drawEyeImages(ctx, this.layout.leftEye, state, time);
      this.drawEyeImages(ctx, this.layout.rightEye, state, time);
      return;
    }
    this.drawEyesCanvas(ctx, state, time);
  }

  private drawEyeImages(ctx: CanvasRenderingContext2D, rect: FaceRect, state: FaceState, _time: number): void {
    const happy = state.expression === 'HAPPY';
    const closedAmount = state.expression === 'SLEEP' ? 1 : state.expression === 'SAD' ? 0.72 : state.blink;
    const surprised = state.expression === 'SURPRISE';
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2 + (state.expression === 'SAD' ? rect.height * 0.044 : 0);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(surprised ? 0.92 : 1, surprised ? 1.14 : state.expression === 'SAD' ? 0.88 : 1);
    if (happy) {
      this.drawImageCentered(ctx, this.assets.eyeHappy!, rect.width, rect.height);
    } else {
      ctx.save();
      ctx.globalAlpha *= 1 - closedAmount;
      this.drawImageCentered(ctx, this.assets.eyeOpen!, rect.width, rect.height);
      ctx.save();
      ctx.globalAlpha *= 1 - closedAmount;
      ctx.translate(state.gazeX * rect.width * 0.077, state.gazeY * rect.height * 0.0365);
      this.drawImageCentered(ctx, this.assets.eyeHighlight!, rect.width, rect.height);
      ctx.restore();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= closedAmount;
      this.drawImageCentered(ctx, this.assets.eyeClosed!, rect.width, rect.height);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawImageCentered(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number): void {
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  }

  private drawEyesCanvas(ctx: CanvasRenderingContext2D, state: FaceState, time: number): void {
    const happy = state.expression === 'HAPPY';
    const sleepy = state.expression === 'SLEEP' || state.expression === 'SAD';
    const surprised = state.expression === 'SURPRISE';
    const blinkScale = Math.max(0.035, 1 - state.blink);
    for (const rect of [this.layout.leftEye, this.layout.rightEye]) {
      const eyeX = rect.x + rect.width / 2;
      const eyeY = rect.y + rect.height / 2 + (state.expression === 'SAD' ? rect.height * 0.044 : 0);
      const gazeX = state.gazeX * rect.width * 0.077;
      const gazeY = state.gazeY * rect.height * 0.0365;
      ctx.save();
      ctx.translate(eyeX, eyeY);
      const sx = happy ? 1 : surprised ? 0.92 : 1;
      const sy = happy ? 0.19 : sleepy ? 0.08 : surprised ? 1.14 : blinkScale;
      ctx.scale(sx, sy);
      if (happy) {
        ctx.strokeStyle = brown;
        ctx.lineWidth = rect.width * 0.108;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, rect.height * 0.055, rect.height * 0.245, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
      } else {
        const bob = state.expression === 'THINK' ? Math.sin(time / 530) * 2 : 0;
        ctx.fillStyle = brown;
        ctx.beginPath();
        ctx.ellipse(0, bob, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (sy > 0.45) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(-rect.width * 0.086 + gazeX, -rect.height * 0.219 + gazeY, rect.width * 0.176, rect.height * 0.146, -0.14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  private drawMouth(ctx: CanvasRenderingContext2D, state: FaceState): void {
    const imageKey: FaceAssetName | null = state.expression === 'SAD'
      ? 'mouthSad'
      : state.expression === 'SURPRISE'
        ? 'mouthSurprise'
        : state.expression === 'SLEEP'
          ? 'mouthClosed'
          : null;
    const rect = this.layout.mouth;
    if (imageKey && this.assets[imageKey]) {
      this.drawImageAt(ctx, this.assets[imageKey]!, rect);
      return;
    }
    if (imageKey) {
      this.drawMouthCanvas(ctx, state);
      return;
    }
    if (state.expression === 'TALK' && this.assets.mouthOpen && this.assets.mouthClosed) {
      const open = Math.max(0, Math.min(1, state.mouthOpen));
      const alpha = ctx.globalAlpha;
      ctx.save();
      ctx.globalAlpha = alpha * (1 - open);
      this.drawImageAt(ctx, this.assets.mouthClosed, rect);
      ctx.globalAlpha = alpha * open;
      this.drawImageAt(ctx, this.assets.mouthOpen, rect);
      ctx.restore();
      return;
    }
    const image = state.expression === 'TALK' ? null : this.assets.mouthOpen;
    if (image) {
      this.drawImageAt(ctx, image, rect);
      return;
    }
    this.drawMouthCanvas(ctx, state);
  }

  private drawMouthCanvas(ctx: CanvasRenderingContext2D, state: FaceState): void {
    const talking = state.expression === 'TALK';
    const happy = state.expression === 'HAPPY';
    const sad = state.expression === 'SAD';
    const surprised = state.expression === 'SURPRISE';
    const sleeping = state.expression === 'SLEEP';
    const open = Math.max(state.mouthOpen, talking ? 0.24 : happy ? 0.12 : 0);
    const rect = this.layout.mouth;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height * 0.47;
    const width = rect.width * (surprised ? 0.328 : 0.447);
    const height = surprised ? rect.height * 0.431 : sleeping ? rect.height * 0.185 : rect.height * (0.404 + open * 0.288);

    if (sad || sleeping) {
      ctx.strokeStyle = brown;
      ctx.lineWidth = rect.width * 0.047;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (sad) {
        ctx.moveTo(cx - rect.width * 0.219, cy + rect.height * 0.185);
        ctx.quadraticCurveTo(cx, cy - rect.height * 0.127, cx + rect.width * 0.219, cy + rect.height * 0.185);
      } else {
        ctx.moveTo(cx - rect.width * 0.167, cy);
        ctx.quadraticCurveTo(cx, cy + rect.height * 0.092, cx + rect.width * 0.167, cy);
      }
      ctx.stroke();
      return;
    }

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = rect.width * 0.047;
    ctx.strokeStyle = brown;
    ctx.fillStyle = '#8c241b';
    ctx.beginPath();
    ctx.moveTo(cx - width, cy - height * 0.82);
    ctx.bezierCurveTo(cx - width * 1.09, cy - height * 0.99, cx - width * 0.93, cy - height * 1.01, cx - width * 0.82, cy - height * 0.82);
    ctx.bezierCurveTo(cx - width * 0.51, cy - height * 0.53, cx - width * 0.22, cy - height * 0.43, cx, cy - height * 0.43);
    ctx.bezierCurveTo(cx + width * 0.22, cy - height * 0.43, cx + width * 0.51, cy - height * 0.53, cx + width * 0.82, cy - height * 0.82);
    ctx.bezierCurveTo(cx + width * 0.93, cy - height * 1.01, cx + width * 1.09, cy - height * 0.99, cx + width, cy - height * 0.82);
    ctx.bezierCurveTo(cx + width * 1.08, cy - height * 0.24, cx + width * 0.89, cy + height * 0.54, cx + width * 0.57, cy + height * 0.79);
    ctx.bezierCurveTo(cx + width * 0.29, cy + height, cx - width * 0.29, cy + height, cx - width * 0.57, cy + height * 0.79);
    ctx.bezierCurveTo(cx - width * 0.89, cy + height * 0.54, cx - width * 1.08, cy - height * 0.24, cx - width, cy - height * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (open > 0.15 || happy || surprised) {
      ctx.save();
      ctx.beginPath();
      ctx.clip();
      ctx.fillStyle = '#ff706f';
      ctx.beginPath();
      ctx.beginPath();
      ctx.moveTo(cx - width * 0.83, cy + height * 0.47);
      ctx.bezierCurveTo(cx - width * 0.53, cy + height * 0.11, cx - width * 0.21, cy + height * 0.03, cx, cy + height * 0.03);
      ctx.bezierCurveTo(cx + width * 0.21, cy + height * 0.03, cx + width * 0.53, cy + height * 0.11, cx + width * 0.83, cy + height * 0.47);
      ctx.bezierCurveTo(cx + width * 0.61, cy + height * 0.84, cx + width * 0.29, cy + height * 0.96, cx, cy + height * 0.96);
      ctx.bezierCurveTo(cx - width * 0.29, cy + height * 0.96, cx - width * 0.61, cy + height * 0.84, cx - width * 0.83, cy + height * 0.47);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawImageAt(ctx: CanvasRenderingContext2D, image: CanvasImageSource, rect: FaceRect): void {
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }
}
