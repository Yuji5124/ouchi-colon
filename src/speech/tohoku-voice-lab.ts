export type TohokuLabState = 'idle' | 'initializing' | 'ready' | 'generating' | 'generated' | 'error' | 'stopped';
export type TohokuLabEvent = {
  type: 'status' | 'progress' | 'ready' | 'generated' | 'error' | 'warning';
  message?: string;
  phase?: string;
  loaded?: number;
  total?: number;
  initializationMs?: number;
  generationMs?: number;
  byteLength?: number;
  requestId?: number;
  wav?: ArrayBuffer;
  stage?: string;
};

export interface TohokuWorkerPort {
  onmessage: ((event: MessageEvent<TohokuLabEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type TohokuWorkerFactory = () => TohokuWorkerPort;

type PendingRequest = {
  resolve: (value: TohokuLabEvent) => void;
  reject: (error: Error) => void;
};

export class TohokuVoiceLab {
  state: TohokuLabState = 'idle';
  status = '未初期化。開始ボタンでWASM・辞書・Happyモデルを取得します。';
  initializationMs: number | null = null;
  lastGenerationMs: number | null = null;
  lastAudioBytes: number | null = null;
  private worker: TohokuWorkerPort | null = null;
  private nextRequestId = 1;
  private pendingInit: PendingRequest | null = null;
  private pendingSynthesis: PendingRequest | null = null;
  private listeners = new Set<(event: TohokuLabEvent) => void>();
  private readonly createWorker: TohokuWorkerFactory;

  constructor(createWorker: TohokuWorkerFactory) {
    this.createWorker = createWorker;
  }

  onEvent(listener: (event: TohokuLabEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): Promise<void> {
    if (this.state === 'ready' || this.state === 'generated') return Promise.resolve();
    if (this.pendingInit) return new Promise((resolve, reject) => {
      const unsubscribe = this.onEvent((event) => {
        if (event.type === 'ready') { unsubscribe(); resolve(); }
        if (event.type === 'error' && event.stage === 'initialize') { unsubscribe(); reject(new Error(event.message)); }
      });
    });
    this.ensureWorker();
    this.state = 'initializing';
    this.status = 'Open JTalkを初期化しています…';
    const promise = new Promise<void>((resolve, reject) => {
      this.pendingInit = {
        resolve: () => resolve(),
        reject: (error) => reject(error),
      };
    });
    this.worker!.postMessage({ type: 'init' });
    return promise;
  }

  async generate(text: string): Promise<TohokuLabEvent> {
    if (this.pendingSynthesis) throw new Error('音声を生成中です。');
    if (this.state !== 'ready' && this.state !== 'generated') throw new Error('先にTOHOKU VOICE LABを初期化してください。');
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 180) throw new Error('日本語の文章を1〜180文字で入力してください。');
    const requestId = this.nextRequestId++;
    this.state = 'generating';
    this.status = '音声を生成しています…';
    const promise = new Promise<TohokuLabEvent>((resolve, reject) => {
      this.pendingSynthesis = { resolve, reject };
    });
    this.worker!.postMessage({ type: 'synthesize', text: cleanText, requestId });
    return promise;
  }

  stop(): void {
    if (!this.worker) {
      this.state = 'stopped';
      this.status = '停止しました。';
      return;
    }
    this.worker.postMessage({ type: 'cancel' });
    this.worker.terminate();
    this.worker = null;
    this.pendingInit?.reject(new Error('TOHOKU VOICE LABを停止しました。'));
    this.pendingSynthesis?.reject(new Error('音声生成を停止しました。'));
    this.pendingInit = null;
    this.pendingSynthesis = null;
    this.state = 'stopped';
    this.status = '停止しました。再試行するとWorkerを作り直します。';
  }

  private ensureWorker(): void {
    if (this.worker) return;
    try {
      this.worker = this.createWorker();
    } catch (error) {
      this.state = 'error';
      this.status = error instanceof Error ? error.message : 'Workerを作成できませんでした。';
      throw new Error(this.status);
    }
    this.worker.onmessage = (message) => this.handleMessage(message.data);
    this.worker.onerror = (event) => this.fail(event.message || 'WASM Workerが停止しました。', 'worker');
  }

  private handleMessage(event: TohokuLabEvent): void {
    if (event.type === 'status' && event.message) this.status = event.message;
    if (event.type === 'ready') {
      this.initializationMs = event.initializationMs ?? null;
      this.state = 'ready';
      this.status = 'TOHOKU Happyを初期化しました。生成音声はこの端末のメモリだけにあります。';
      this.pendingInit?.resolve(event);
      this.pendingInit = null;
    } else if (event.type === 'generated') {
      this.lastGenerationMs = event.generationMs ?? null;
      this.lastAudioBytes = event.byteLength ?? null;
      this.state = 'generated';
      this.status = '生成完了。再生ボタンを押すとWAVを試聴します。';
      this.pendingSynthesis?.resolve(event);
      this.pendingSynthesis = null;
    } else if (event.type === 'error') {
      if (event.stage === 'initialize') {
        this.state = 'error';
        this.status = event.message ?? '初期化に失敗しました。';
        this.pendingInit?.reject(new Error(this.status));
        this.pendingInit = null;
        this.worker?.terminate();
        this.worker = null;
      } else if (event.stage === 'synthesize') {
        this.state = 'ready';
        this.status = event.message ?? '生成に失敗しました。';
        this.pendingSynthesis?.reject(new Error(this.status));
        this.pendingSynthesis = null;
      }
    }
    for (const listener of this.listeners) listener(event);
  }

  private fail(message: string, stage: string): void {
    this.state = 'error';
    this.status = message;
    const error = new Error(message);
    this.pendingInit?.reject(error);
    this.pendingSynthesis?.reject(error);
    this.pendingInit = null;
    this.pendingSynthesis = null;
    const event: TohokuLabEvent = { type: 'error', stage, message };
    for (const listener of this.listeners) listener(event);
    this.worker?.terminate();
    this.worker = null;
  }
}
