import { FaceRenderer, expressions, type Expression, type FaceState } from './character/face-renderer';
import { FpsMeter } from './app/fps-meter';
import { LatencySamples } from './app/latency-samples';
import { FaceTrackingStabilizer, smoothGaze, toFaceGazeTarget, type FaceTrackingInput } from './vision/face-tracking-input';
import { MediaPipeFaceTracker, type FaceTrackerMetrics } from './vision/media-pipe-face-tracker';
import { cameraFailureMessage, detectorFailureMessage } from './vision/tracking-errors';
import { EMPTY_CONVERSATION_CONTEXT, RuleBasedConversationEngine, type ConversationContext } from './conversation/conversation-engine';
import { ReactionEngine, type ReactionEvent } from './reaction/reaction-engine';
import { SpeechRecognitionEngine } from './speech/speech-recognition-engine';
import { SpeechSynthesisEngine, type SpeechCallbacks, type SpeechEndReason } from './speech/speech-synthesis-engine';
import { NativeTtsDiagnostic, type DiagnosticSpeechPort, type DiagnosticUtterance, type DiagnosticVoiceMode, type NativeDiagnosticEvent } from './speech/tts-diagnostic';
import { TohokuVoiceLab, type TohokuLabEvent, type TohokuWorkerPort } from './speech/tohoku-voice-lab';
import { runTohokuBenchmark, summarizeTohokuSamples, TohokuBenchmarkError } from './speech/tohoku-benchmark';
import { TohokuConversationSpeech, WebAudioTohokuOutput } from './speech/tohoku-conversation-speech';
import { createDiagnosticReport } from './app/diagnostic-report';
import { canStartConversation, fallbackReplyVoice, INITIAL_REPLY_VOICE_MODE } from './speech/reply-voice-policy';
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
let trackingFaceKnown = false;
const fpsMeter = new FpsMeter();
const faceStabilizer = new FaceTrackingStabilizer();
const reactionEngine = new ReactionEngine();
const conversationEngine = new RuleBasedConversationEngine();
const recognitionEngine = new SpeechRecognitionEngine();
const speechEngine = new SpeechSynthesisEngine();
const nativeSpeechPort = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  ? window.speechSynthesis as unknown as DiagnosticSpeechPort : null;
const nativeTtsDiagnostic = new NativeTtsDiagnostic(
  nativeSpeechPort,
  (text) => new SpeechSynthesisUtterance(text) as unknown as DiagnosticUtterance,
);
const latencySamples = new LatencySamples(200);
let conversationContext: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT };
let conversationGeneration = 0;
let idleSleepTimer = 0;
let faceReactionTimer = 0;
let submittedUtteranceEndedAt = 0;
let replyGenerationMs = 0;
let ttsStartMs: number | null = null;
let ttsStartDelayMs: number | null = null;
let tohokuGenerationMs: number | null = null;
let activeReplyEngineForTurn: 'ios' | 'tohoku' | 'ios-fallback' = 'ios';
let voiceReactionMs: number | null = null;
let recognitionEnabled = false;
let voiceResponseActive = false;
let speechEndHandled = false;
const reactionEvents: string[] = [];
let detectionFps = 0;
let detectionLatencyMs = 0;
let latestRenderFps: number | null = null;
let interimReactionSent = false;
let pendingVisualReactionAt: number | null = null;
let utteranceEndAt: number | null = null;
let ttsRequestedAt: number | null = null;
let mouthMotionStartedAt: number | null = null;
let ttsEndTurnCount = 0;
let tohokuConversationAttempts = 0;
let tohokuConversationSuccesses = 0;
let tohokuConversationFallbacks = 0;
let tohokuConversationFailures = 0;
let tohokuConversationTurnTracked = false;
let tohokuConversationTurnFellBack = false;
let visibleAppState = '保護者がTOHOKU Happyを準備してください';
let lastErrorCode = 'なし';

type SpeechStage =
  | 'microphone' | 'recognition-start' | 'voice-detected' | 'interim-result' | 'final-result'
  | 'conversation-input' | 'reply-generated' | 'tts-request' | 'tts-start' | 'mouth-start'
  | 'tts-end' | 'mouth-stop' | 'recognition-resume';

const SPEECH_STAGE_LABELS: Record<SpeechStage, string> = {
  microphone: '1 マイク許可',
  'recognition-start': '2 音声認識開始',
  'voice-detected': '3 発話検出',
  'interim-result': '4 途中認識',
  'final-result': '5 最終認識',
  'conversation-input': '6 会話入力',
  'reply-generated': '7 返答生成',
  'tts-request': '8 TTS開始要求',
  'tts-start': '9 TTS onstart',
  'mouth-start': '10 口パク開始',
  'tts-end': '11 TTS onend/onerror',
  'mouth-stop': '12 口パク停止',
  'recognition-resume': '13 音声認識再開',
};

const speechStageState = new Map<SpeechStage, string>();
const speechDiagnosticLog: string[] = [];

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
const conversationInput = document.querySelector<HTMLInputElement>('#conversation-input')!;
const conversationSendButton = document.querySelector<HTMLButtonElement>('#conversation-send')!;
const conversationReply = document.querySelector<HTMLOutputElement>('#conversation-reply')!;
const conversationTiming = document.querySelector<HTMLOutputElement>('#conversation-timing')!;
const recognitionConsent = document.querySelector<HTMLInputElement>('#recognition-consent')!;
const recognitionStartButton = document.querySelector<HTMLButtonElement>('#recognition-start')!;
const recognitionStopButton = document.querySelector<HTMLButtonElement>('#recognition-stop')!;
const recognitionStatus = document.querySelector<HTMLOutputElement>('#recognition-status')!;
const recognitionInterim = document.querySelector<HTMLOutputElement>('#recognition-interim')!;
const recognitionFinal = document.querySelector<HTMLOutputElement>('#recognition-final')!;
const speechStatus = document.querySelector<HTMLOutputElement>('#speech-status')!;
const speechStopButton = document.querySelector<HTMLButtonElement>('#speech-stop')!;
const replyVoiceEngineSelect = document.querySelector<HTMLSelectElement>('#reply-voice-engine')!;
const voiceTestStatus = document.querySelector<HTMLOutputElement>('#voice-test-status')!;
const ttsEnabled = document.querySelector<HTMLInputElement>('#tts-enabled')!;
const reactionHistory = document.querySelector<HTMLOutputElement>('#reaction-history')!;
const voiceTestButton = document.querySelector<HTMLButtonElement>('#voice-test')!;
const speechRuntimeOutput = document.querySelector<HTMLOutputElement>('#speech-runtime')!;
const speechStagesOutput = document.querySelector<HTMLOutputElement>('#speech-stages')!;
const speechDiagnosticsOutput = document.querySelector<HTMLOutputElement>('#speech-diagnostics')!;
const appStateOutput = document.querySelector<HTMLOutputElement>('#app-state')!;
const diagnosticCopyButton = document.querySelector<HTMLButtonElement>('#diagnostic-copy')!;
const diagnosticCopyStatus = document.querySelector<HTMLOutputElement>('#diagnostic-copy-status')!;
const diagnosticReportOutput = document.querySelector<HTMLOutputElement>('#diagnostic-report')!;
const mediaConcurrencyOutput = document.querySelector<HTMLOutputElement>('#media-concurrency')!;
const nativeVoiceMode = document.querySelector<HTMLSelectElement>('#native-voice-mode')!;
const nativeCancelFirst = document.querySelector<HTMLInputElement>('#native-cancel-first')!;
const nativeTtsRunButton = document.querySelector<HTMLButtonElement>('#native-tts-run')!;
const wrapperTtsRunButton = document.querySelector<HTMLButtonElement>('#wrapper-tts-run')!;
const diagnosticStopButton = document.querySelector<HTMLButtonElement>('#tts-diagnostic-stop')!;
const diagnosticResumeButton = document.querySelector<HTMLButtonElement>('#tts-diagnostic-resume')!;
const diagnosticPlatformOutput = document.querySelector<HTMLOutputElement>('#tts-diagnostic-platform')!;
const diagnosticVoicesOutput = document.querySelector<HTMLOutputElement>('#tts-diagnostic-voices')!;
const diagnosticResultOutput = document.querySelector<HTMLOutputElement>('#tts-diagnostic-result')!;
const diagnosticEventsOutput = document.querySelector<HTMLOutputElement>('#tts-diagnostic-events')!;
const voiceChoice = document.querySelector<HTMLSelectElement>('#voice-choice')!;
const voiceProfile = document.querySelector<HTMLSelectElement>('#voice-profile')!;
const voiceRate = document.querySelector<HTMLInputElement>('#voice-rate')!;
const voicePitch = document.querySelector<HTMLInputElement>('#voice-pitch')!;
const voiceVolume = document.querySelector<HTMLInputElement>('#voice-volume')!;
const voiceAuditionButton = document.querySelector<HTMLButtonElement>('#voice-audition')!;
const voiceSelectorStatus = document.querySelector<HTMLOutputElement>('#voice-selector-status')!;
const latencyOutput = document.querySelector<HTMLOutputElement>('#latency-summary')!;
const tohokuInitButton = document.querySelector<HTMLButtonElement>('#tohoku-init')!;
const tohokuConversationEnableButton = document.querySelector<HTMLButtonElement>('#tohoku-conversation-enable')!;
const tohokuConversationStatus = document.querySelector<HTMLOutputElement>('#tohoku-conversation-status')!;
const tohokuStopButton = document.querySelector<HTMLButtonElement>('#tohoku-stop')!;
const tohokuFallbackButton = document.querySelector<HTMLButtonElement>('#tohoku-fallback')!;
const tohokuSample = document.querySelector<HTMLSelectElement>('#tohoku-sample')!;
const tohokuText = document.querySelector<HTMLInputElement>('#tohoku-text')!;
const tohokuGenerateSampleButton = document.querySelector<HTMLButtonElement>('#tohoku-generate-sample')!;
const tohokuGenerateTextButton = document.querySelector<HTMLButtonElement>('#tohoku-generate-text')!;
const tohokuPlayButton = document.querySelector<HTMLButtonElement>('#tohoku-play')!;
const tohokuPlayStopButton = document.querySelector<HTMLButtonElement>('#tohoku-play-stop')!;
const tohokuBenchmarkButton = document.querySelector<HTMLButtonElement>('#tohoku-benchmark')!;
const tohokuBenchmarkCancelButton = document.querySelector<HTMLButtonElement>('#tohoku-benchmark-cancel')!;
const tohokuStatus = document.querySelector<HTMLOutputElement>('#tohoku-status')!;
const tohokuMetrics = document.querySelector<HTMLOutputElement>('#tohoku-metrics')!;
const tohokuBenchmarkResults = document.querySelector<HTMLOutputElement>('#tohoku-benchmark-results')!;
const tohokuError = document.querySelector<HTMLOutputElement>('#tohoku-error')!;
const tohokuVoiceLab = new TohokuVoiceLab(() => {
  if (typeof Worker === 'undefined') throw new Error('このブラウザーはWeb Workerに対応していません。');
  return new Worker(new URL('openjtalk/worker.js', document.baseURI), { type: 'module' }) as unknown as TohokuWorkerPort;
});
const tohokuConversationSpeech = new TohokuConversationSpeech(tohokuVoiceLab, new WebAudioTohokuOutput());
const tohokuGenerationSamples: number[] = [];
const tohokuInitializationSamples: number[] = [];
const tohokuPlaybackSamples: number[] = [];
let tohokuAudioUrl: string | null = null;
let tohokuAudio: HTMLAudioElement | null = null;
let tohokuBenchmarkRunning = false;
let tohokuBenchmarkCancelRequested = false;
let replyVoiceMode: 'ios' | 'tohoku' = INITIAL_REPLY_VOICE_MODE;
let tohokuConversationActivated = false;
let diagnosticOwner: 'native' | 'wrapper' | null = null;
let diagnosticEvents: string[] = [];
let workerCacheStatus = '未確認';
let diagnosticPollingTimer = 0;

function startDiagnosticPolling(): void {
  window.clearInterval(diagnosticPollingTimer);
  diagnosticPollingTimer = window.setInterval(renderTtsDiagnostic, 300);
}

function stopDiagnosticPolling(): void {
  window.clearInterval(diagnosticPollingTimer);
  diagnosticPollingTimer = 0;
}

function browserSpeechState(): string {
  const synth = nativeSpeechPort;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  const mode = standalone ? 'ホーム画面PWA' : 'Safariタブ/ブラウザー';
  const visibility = document.visibilityState;
  return `対応=${Boolean(synth)} / paused=${synth?.paused ?? '--'} / pending=${synth?.pending ?? '--'} / speaking=${synth?.speaking ?? '--'} / ページ=${visibility} / 表示形態=${mode} / SW=${workerCacheStatus} / カメラ=${cameraActive ? 'ON' : 'OFF'} / マイク=${recognitionEngine.isActive ? 'ON' : 'OFF'}`;
}

function renderTtsDiagnostic(): void {
  diagnosticPlatformOutput.value = `Web Speech / ${browserSpeechState()}`;
  const voices = nativeTtsDiagnostic.voices;
  const japanese = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ja'));
  const voiceSummary = japanese.length
    ? japanese.map((voice) => `${voice.name} (${voice.lang})${voice === speechEngine.currentVoice || `${voice.name} (${voice.lang})` === nativeTtsDiagnostic.currentSelectedVoice ? ' [選択]' : ''}`).join('、')
    : '利用可能な日本語voiceなし';
  diagnosticVoicesOutput.value = `日本語voice: ${voiceSummary} / engine選択=${speechEngine.currentVoice ? `${speechEngine.currentVoice.name} (${speechEngine.currentVoice.lang})` : 'なし'} / native選択=${nativeTtsDiagnostic.currentSelectedVoice}`;
  diagnosticEventsOutput.value = `イベント(今回・最大12件): ${diagnosticEvents.length ? diagnosticEvents.join(' → ') : '--'}`;
}

function appendDiagnosticEvent(event: string): void {
  diagnosticEvents.push(event.replace(/[\r\n|]/g, ' ').slice(0, 100));
  if (diagnosticEvents.length > 12) diagnosticEvents.shift();
  renderTtsDiagnostic();
}

function renderSpeechDiagnostics(): void {
  speechStagesOutput.value = `音声経路: ${Object.entries(SPEECH_STAGE_LABELS)
    .map(([stage, label]) => `${label}=${speechStageState.get(stage as SpeechStage) ?? '待機'}`)
    .join(' / ')}`;
  speechDiagnosticsOutput.value = `診断履歴(音声内容なし): ${speechDiagnosticLog.length ? speechDiagnosticLog.join(' | ') : '--'}`;
}

function recordSpeechStage(stage: SpeechStage, status: string): void {
  const safeStatus = status.replace(/[\r\n|]/g, ' ').slice(0, 100);
  speechStageState.set(stage, safeStatus);
  const elapsed = Math.round(performance.now());
  speechDiagnosticLog.push(`${elapsed}ms ${SPEECH_STAGE_LABELS[stage]}: ${safeStatus}`);
  if (speechDiagnosticLog.length > 20) speechDiagnosticLog.shift();
  renderSpeechDiagnostics();
}

function renderSpeechRuntime(): void {
  const selected = replyVoiceMode === 'tohoku' ? 'TOHOKU Happy' : 'iOS標準TTS';
  const local = tohokuConversationSpeech.isBusy ? 'TOHOKU生成/再生中'
    : speechEngine.isSpeaking ? '再生中(onstart済み)'
    : speechEngine.isPending ? '開始待ち'
      : '停止中';
  const voice = speechEngine.voiceStatus === 'japanese-voice-ready' ? 'ja音声あり'
    : speechEngine.voiceStatus === 'loading' ? 'voice一覧待ち'
      : speechEngine.voiceStatus === 'system-default' ? 'ja音声なし・ja-JP既定音声'
        : '音声合成非対応';
  speechRuntimeOutput.value = `音声状態: ${local} / 選択=${selected} / TOHOKU音声有効=${tohokuConversationActivated} / paused=${speechEngine.isPaused} / browser speaking=${speechEngine.browserSpeaking} / pending=${speechEngine.browserPending} / ${voice}`;
}

function setVisibleAppState(value: string): void {
  visibleAppState = value;
  if (appStateOutput) appStateOutput.value = `状態: ${value}`;
}

const ACTION_ICONS: Record<string, string> = {
  wave: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3l2-6 4 12 3-9 2 6h4" /></svg>',
  mic: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" /></svg>',
  speaker: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4zM16 9a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12" /></svg>',
  face: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 10h.01M16 10h.01M8 15q4 4 8 0" /></svg>',
  gear: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.7Z" /></svg>',
};

function assembleQuickActions(): void {
  const root = document.querySelector<HTMLElement>('#quick-actions');
  if (!root) return;
  const consentLabels = [recognitionConsent.closest('label'), ttsEnabled.closest('label')].filter((item): item is HTMLLabelElement => item instanceof HTMLLabelElement);
  const engineLabel = replyVoiceEngineSelect.closest('label');
  const items: Array<[HTMLButtonElement, string]> = [
    [tohokuInitButton, 'wave'], [tohokuConversationEnableButton, 'speaker'],
    [recognitionStartButton, 'mic'], [recognitionStopButton, 'mic'],
    [cameraStartButton, 'face'], [cameraStopButton, 'face'],
    [detectorStartButton, 'face'], [detectorStopButton, 'face'],
    [speechStopButton, 'speaker'],
  ];
  const add = (item: HTMLButtonElement, icon: string): void => {
    if (!item.querySelector('svg')) item.insertAdjacentHTML('afterbegin', ACTION_ICONS[icon]!);
    root.append(item);
  };
  add(tohokuInitButton, 'wave');
  add(tohokuConversationEnableButton, 'speaker');
  for (const label of consentLabels) root.append(label);
  if (engineLabel) root.append(engineLabel);
  for (const [item, icon] of items.slice(2)) add(item, icon);
  minimizeDebugButton.insertAdjacentHTML('afterbegin', ACTION_ICONS.face!);
  replyVoiceEngineSelect.value = replyVoiceMode;
}

async function copyDiagnosticReport(): Promise<void> {
  const report = createDiagnosticReport({
    appVersion: __APP_VERSION__,
    commit: __APP_COMMIT__,
    serviceWorker: workerCacheStatus,
    voiceEngine: replyVoiceMode === 'tohoku' ? 'TOHOKU Happy' : 'iOS標準TTS（フォールバック）',
    tohokuModel: `${tohokuVoiceLab.state}${tohokuConversationActivated ? ' / 会話音声有効' : ' / 会話音声未有効'}`,
    microphone: recognitionEngine.isActive ? 'ON' : 'OFF',
    camera: cameraActive ? 'ON' : 'OFF',
    lastGenerationMs: tohokuVoiceLab.lastGenerationMs,
    lastPlaybackStartMs: ttsStartMs,
    conversationTurns: ttsEndTurnCount,
    errorCode: lastErrorCode,
    fallbackCount: tohokuConversationFallbacks,
  });
  if (!navigator.clipboard?.writeText) {
    diagnosticCopyStatus.value = 'クリップボード非対応です。下のテキストを長押ししてコピーしてください。';
    diagnosticReportOutput.value = report;
    return;
  }
  try {
    await navigator.clipboard.writeText(report);
    diagnosticCopyStatus.value = '診断結果をコピーしました。認識した文章・会話履歴は含みません。';
  } catch {
    diagnosticCopyStatus.value = '自動コピーできません。下のテキストを長押ししてコピーしてください。';
    diagnosticReportOutput.value = report;
  }
}

function renderMediaConcurrency(): void {
  const speaking = tohokuConversationSpeech.isBusy || speechEngine.isSpeaking || speechEngine.isPending;
  mediaConcurrencyOutput.value = `カメラ ${cameraActive ? 'ON' : 'OFF'} / 顔検出 ${detectorActive ? 'ON' : 'OFF'} / 認識 ${recognitionEngine.isActive ? 'ON' : 'OFF'} / TTS ${speaking ? '生成/再生中' : 'OFF'} / 描画 ${latestRenderFps?.toFixed(1) ?? '--'} FPS`;
}

function isAnySpeechActive(): boolean {
  return speechEngine.shouldSuppressRecognition || tohokuConversationSpeech.isBusy;
}

function resetTohokuConversationAudio(message: string, useIosFallback = true): void {
  tohokuConversationSpeech.close();
  talking = false;
  state.mouthOpen = 0;
  mouthMotionStartedAt = null;
  tohokuConversationActivated = false;
  replyVoiceMode = useIosFallback ? fallbackReplyVoice() : INITIAL_REPLY_VOICE_MODE;
  replyVoiceEngineSelect.value = replyVoiceMode;
  replyVoiceEngineSelect.options[1]!.disabled = true;
  tohokuConversationStatus.value = message;
  setVisibleAppState(`${useIosFallback ? 'iOS音声へ切替' : 'TOHOKU再有効化待ち'}: ${message}`);
  renderSpeechRuntime();
}

speechEngine.onVoicesChanged(() => {
  renderVoiceChoices();
  recordSpeechStage('tts-request', `voice一覧更新:${speechEngine.voiceStatus}`);
  renderSpeechRuntime();
});

const VOICE_PROFILES: Record<string, { rate: number; pitch: number; volume: number }> = {
  gentle: { rate: 0.88, pitch: 1.08, volume: 1 },
  energetic: { rate: 0.96, pitch: 1.22, volume: 1 },
  calm: { rate: 0.82, pitch: 0.98, volume: 0.92 },
};

function renderVoiceChoices(): void {
  const previous = voiceChoice.value;
  const japanese = speechEngine.voices.filter((voice) => voice.lang.toLowerCase().startsWith('ja'));
  voiceChoice.replaceChildren(new Option('自動（従来設定）', ''));
  for (const voice of japanese) voiceChoice.add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI));
  voiceChoice.value = japanese.some((voice) => voice.voiceURI === previous) ? previous : '';
  if (japanese.length === 0) voiceSelectorStatus.value = '日本語voiceが見つかりません。自動のja-JP設定で試します。';
}

function selectedSpeechSettings() {
  return { voiceURI: voiceChoice.value || undefined, rate: Number(voiceRate.value), pitch: Number(voicePitch.value), volume: Number(voiceVolume.value) };
}

function renderLatencySummary(): void {
  const line = (name: string, label: string): string => {
    const value = latencySamples.summary(name);
    return `${label} n=${value.count} 中央値=${value.median?.toFixed(0) ?? '--'}ms p95=${value.p95?.toFixed(0) ?? '--'}ms`;
  };
  latencyOutput.value = `20ターン連続会話チェック: 全TTS完了 ${ttsEndTurnCount}/20 / TOHOKU成功 ${tohokuConversationSuccesses}/${tohokuConversationAttempts}・iOS復帰 ${tohokuConversationFallbacks}・失敗 ${tohokuConversationFailures}（可聴確認は実機） / ${line('reaction', '発話イベント→描画更新')}; ${line('final', '発話終了→認識確定')}; ${line('generation', '確定→返答生成')}; ${line('tohoku-generation', 'TOHOKU音声生成のみ')}; ${line('tts', 'TTS要求→再生開始')}; ${line('turn-tohoku', '発話終了→TOHOKU音声開始')}; ${line('turn-ios', '発話終了→iOS音声開始')}; ${line('turn-ios-fallback', '発話終了→iOS復帰音声開始')}; ${line('resume', 'TTS終了→認識再開要求')}`;
}

function samplePercentile(samples: number[], percentile: number): number | null {
  if (!samples.length) return null;
  const ordered = [...samples].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(percentile * ordered.length) - 1)] ?? null;
}

function renderTohokuMetrics(): void {
  const format = (samples: number[]): string => {
    const median = samplePercentile(samples, 0.5);
    const p95 = samplePercentile(samples, 0.95);
    return `n=${samples.length} 中央値=${median?.toFixed(0) ?? '--'}ms p95=${p95?.toFixed(0) ?? '--'}ms`;
  };
  const lastGeneration = tohokuVoiceLab.lastGenerationMs === null ? '--' : `${tohokuVoiceLab.lastGenerationMs.toFixed(0)}ms`;
  const bytes = tohokuVoiceLab.lastAudioBytes === null ? '--' : `${(tohokuVoiceLab.lastAudioBytes / 1024).toFixed(0)}KB`;
  tohokuMetrics.value = `初期化 ${format(tohokuInitializationSamples)} / 直近の音声生成 ${lastGeneration} / 生成時間 ${format(tohokuGenerationSamples)} / 再生開始 ${format(tohokuPlaybackSamples)} / WAV ${bytes} / memory UNKNOWN`;
}

let tohokuPlayRequestedAt: number | null = null;
tohokuVoiceLab.onEvent((event: TohokuLabEvent) => {
  if (event.type === 'status' && event.message) tohokuStatus.value = event.message;
  if (event.type === 'progress' && event.phase === 'dictionary' && event.loaded) {
    tohokuStatus.value = `辞書を展開しています（${(event.loaded / 1024 / 1024).toFixed(0)} MB）…`;
  }
  if (event.type === 'ready') {
    if (event.initializationMs !== undefined) tohokuInitializationSamples.push(event.initializationMs);
    tohokuStatus.value = `Happyモデルの初期化完了 (${event.initializationMs?.toFixed(0) ?? '--'} ms)。音声を生成できます。`;
    tohokuGenerateSampleButton.disabled = false;
    tohokuGenerateTextButton.disabled = false;
    tohokuBenchmarkButton.disabled = false;
    tohokuInitButton.disabled = true;
    tohokuStopButton.disabled = false;
    tohokuConversationEnableButton.disabled = false;
    tohokuConversationStatus.value = 'モデル準備完了。保護者が「会話用の音声を有効化」を押して試聴すると、TOHOKU Happyで会話を開始できます。';
    setVisibleAppState('TOHOKUモデル準備完了・音声有効化待ち');
  }
  if (event.type === 'generated' && event.wav) {
    if (event.purpose !== 'conversation') {
      if (tohokuAudio) tohokuAudio.pause();
      if (tohokuAudioUrl) URL.revokeObjectURL(tohokuAudioUrl);
      tohokuAudioUrl = URL.createObjectURL(new Blob([event.wav], { type: 'audio/wav' }));
      tohokuAudio = new Audio(tohokuAudioUrl);
      tohokuAudio.onplaying = () => {
        if (tohokuPlayRequestedAt !== null) tohokuPlaybackSamples.push(performance.now() - tohokuPlayRequestedAt);
        tohokuPlayRequestedAt = null;
        tohokuStatus.value = 'TOHOKU Happy音声を再生中です。可聴確認は端末で行ってください。';
        tohokuPlayStopButton.disabled = false;
        renderTohokuMetrics();
      };
      tohokuAudio.onended = () => { tohokuStatus.value = '再生終了。音声データはメモリ内にあり、再生ボタンで再試聴できます。'; };
      tohokuAudio.onerror = () => {
        lastErrorCode = 'TOHOKU_PREVIEW_PLAYBACK_FAILED';
        tohokuStatus.value = '生成音声の再生に失敗しました。既存iOS TTSで比較できます。';
        tohokuError.value = '生成したWAVをSafariで再生できませんでした。';
        tohokuPlayStopButton.disabled = true;
      };
      tohokuPlayButton.disabled = false;
      tohokuPlayStopButton.disabled = true;
    }
    if (event.generationMs !== undefined && event.purpose !== 'conversation') tohokuGenerationSamples.push(event.generationMs);
    tohokuStatus.value = event.purpose === 'conversation'
      ? `通常会話の返答音声を生成しました (${event.generationMs?.toFixed(0) ?? '--'} ms)。再生イベントを待っています。`
      : `音声生成完了 (${event.generationMs?.toFixed(0) ?? '--'} ms)。Safariでは再生に別の操作が必要な場合があります。`;
    tohokuError.value = '';
    renderTohokuMetrics();
  }
  if (event.type === 'error') {
    lastErrorCode = `TOHOKU_${String(event.stage ?? 'LAB').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
    tohokuError.value = `${event.stage ?? '実験'}エラー: ${event.message ?? '不明なエラー'}`;
    tohokuStatus.value = `${tohokuVoiceLab.status} 既存のiOS標準TTSは通常会話で引き続き利用できます。`;
    const available = tohokuVoiceLab.state === 'ready' || tohokuVoiceLab.state === 'generated';
    tohokuInitButton.disabled = available;
    tohokuGenerateSampleButton.disabled = !available;
    tohokuGenerateTextButton.disabled = !available;
    tohokuBenchmarkButton.disabled = !available;
    tohokuStopButton.disabled = !available;
    if (!available) tohokuConversationEnableButton.disabled = true;
    if (!available) {
      lastErrorCode = `TOHOKU_${String(event.stage ?? 'INIT').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
      resetTohokuConversationAudio(`TOHOKU準備失敗 (${lastErrorCode})。iOS標準TTSへ切り替えました。`);
    }
  }
});

async function initializeTohokuLab(): Promise<void> {
  tohokuInitButton.disabled = true;
  tohokuError.value = '';
  tohokuStatus.value = 'Worker、WASM、圧縮辞書、Happyモデルを読み込んでいます。カメラとマイクを止めておくと端末負荷を抑えられます。';
  setVisibleAppState('TOHOKUモデル読み込み中');
  try {
    await tohokuVoiceLab.initialize();
  } catch (error) {
    lastErrorCode = 'TOHOKU_INIT_FAILED';
    tohokuStatus.value = `${tohokuVoiceLab.status} 通常会話はiOS標準TTSへ切り替えます。`;
    tohokuError.value = error instanceof Error ? error.message : '初期化に失敗しました。';
    tohokuInitButton.disabled = false;
    resetTohokuConversationAudio(`TOHOKUモデル初期化失敗 (${lastErrorCode})。iOS標準TTSへ切り替えました。`);
  }
}

async function enableTohokuConversationAudio(): Promise<void> {
  if (tohokuVoiceLab.state !== 'ready' && tohokuVoiceLab.state !== 'generated') {
    tohokuConversationStatus.value = '先にHappyモデルを読み込んでください。';
    return;
  }
  tohokuConversationEnableButton.disabled = true;
  tohokuConversationStatus.value = 'この操作で会話用音声を有効化し、確認のあいさつを生成して再生します…';
  setVisibleAppState('TOHOKU確認音声を生成中');
  try {
    // The AudioContext is created and resume() is invoked synchronously in this user gesture.
    await tohokuConversationSpeech.unlock();
    const sample = await tohokuConversationSpeech.speak('こんにちは！コロンだよ！', () => {
      talking = true;
      applyReaction('RESPONSE_STARTED');
      tohokuConversationStatus.value = '確認音声を再生中です。聞こえたか確認してください。';
      setVisibleAppState('TOHOKU確認音声を再生中（端末で聞こえたか確認してください）');
    });
    talking = false;
    state.mouthOpen = 0;
    applyReaction('RESPONSE_ENDED');
    if (sample.reason !== 'finished') throw new Error(sample.error ?? '確認音声が最後まで再生されませんでした。');
    if (sample.generationMs !== undefined) {
      tohokuGenerationSamples.push(sample.generationMs);
      tohokuGenerationMs = sample.generationMs;
      renderTohokuMetrics();
      updateConversationTiming();
    }
    tohokuConversationActivated = true;
    replyVoiceEngineSelect.options[1]!.disabled = false;
    replyVoiceMode = 'tohoku';
    replyVoiceEngineSelect.value = 'tohoku';
    tohokuConversationStatus.value = 'TOHOKU Happyの会話準備が完了しました。確認音声が聞こえたことを保護者が確認してから会話を開始してください。';
    setVisibleAppState('TOHOKU Happy準備完了・会話開始待ち');
    renderSpeechRuntime();
  } catch (error) {
    talking = false;
    state.mouthOpen = 0;
    tohokuConversationActivated = false;
    replyVoiceEngineSelect.options[1]!.disabled = true;
    lastErrorCode = 'TOHOKU_AUDIO_UNLOCK_FAILED';
    resetTohokuConversationAudio(`会話用音声を有効化できませんでした (${lastErrorCode})。iOS標準TTSへ切り替えました: ${error instanceof Error ? error.message : 'Web Audio非対応'}`);
  } finally {
    tohokuConversationEnableButton.disabled = tohokuVoiceLab.state !== 'ready' && tohokuVoiceLab.state !== 'generated';
    renderSpeechRuntime();
  }
}

async function generateTohokuAudio(text: string): Promise<void> {
  tohokuAudio?.pause();
  tohokuPlayRequestedAt = null;
  tohokuError.value = '';
  tohokuGenerateSampleButton.disabled = true;
  tohokuGenerateTextButton.disabled = true;
  tohokuBenchmarkButton.disabled = true;
  try {
    await tohokuVoiceLab.generate(text);
  } catch (error) {
    tohokuError.value = error instanceof Error ? error.message : '音声生成に失敗しました。';
  } finally {
    const available = tohokuVoiceLab.state === 'ready' || tohokuVoiceLab.state === 'generated';
    tohokuGenerateSampleButton.disabled = !available;
    tohokuGenerateTextButton.disabled = !available;
    tohokuBenchmarkButton.disabled = !available || tohokuBenchmarkRunning;
  }
}

async function runTohokuTwentyGenerationBenchmark(): Promise<void> {
  if (tohokuBenchmarkRunning || (tohokuVoiceLab.state !== 'ready' && tohokuVoiceLab.state !== 'generated')) return;
  tohokuBenchmarkRunning = true;
  tohokuBenchmarkCancelRequested = false;
  tohokuBenchmarkButton.disabled = true;
  tohokuBenchmarkCancelButton.disabled = false;
  tohokuGenerateSampleButton.disabled = true;
  tohokuGenerateTextButton.disabled = true;
  tohokuError.value = '';
  tohokuBenchmarkResults.value = '20回連続生成: 準備中…';
  tohokuStatus.value = '同じ初期化済みWorkerで、異なる20文を順番に音声生成します。自動再生はせず、最後のWAVを試聴できます。';
  const samples: number[] = [];
  try {
    const result = await runTohokuBenchmark(async (text) => {
      tohokuText.value = text;
      const event = await tohokuVoiceLab.generate(text, 'benchmark');
      if (event.generationMs === undefined) throw new Error('Workerから生成時間が返りませんでした。');
      return event.generationMs;
    }, (progress) => {
      samples.push(progress.generationMs);
      const summary = summarizeTohokuSamples(samples);
      tohokuStatus.value = `連続生成 ${progress.completed}/${progress.total} 回。辞書・Workerは保持中です。`;
      tohokuBenchmarkResults.value = `進行 ${progress.completed}/${progress.total} / 中央値 ${summary.median?.toFixed(0) ?? '--'} ms / p95 ${summary.p95?.toFixed(0) ?? '--'} ms / 最大 ${summary.max?.toFixed(0) ?? '--'} ms / 各回 ${samples.map((sample) => sample.toFixed(0)).join(', ')} ms`;
    }, () => tohokuBenchmarkCancelRequested);
    const summary = summarizeTohokuSamples(result.samples);
    const state = result.cancelled ? '中断' : '完了';
    tohokuBenchmarkResults.value = `20回連続生成 ${state}: ${summary.count}/20 / 中央値 ${summary.median?.toFixed(0) ?? '--'} ms / p95 ${summary.p95?.toFixed(0) ?? '--'} ms / 最大 ${summary.max?.toFixed(0) ?? '--'} ms / 各回 ${result.samples.map((sample) => sample.toFixed(0)).join(', ')} ms`;
    tohokuStatus.value = result.cancelled
      ? `連続生成を中断しました（${summary.count}件完了）。初期化済みWorkerは保持されています。`
      : '20種類の文を同じWorkerで生成しました。最新の音声は再生ボタンから確認できます。';
  } catch (error) {
    const currentLabState: string = tohokuVoiceLab.state;
    if (tohokuBenchmarkCancelRequested && currentLabState === 'stopped') {
      const summary = summarizeTohokuSamples(samples);
      tohokuBenchmarkResults.value = `連続生成を中断: ${summary.count}/20 完了 / 中央値 ${summary.median?.toFixed(0) ?? '--'} ms / p95 ${summary.p95?.toFixed(0) ?? '--'} ms / 最大 ${summary.max?.toFixed(0) ?? '--'} ms`;
      tohokuStatus.value = 'Workerを停止し、連続生成を中断しました。再開するにはHappyモデルを再読み込みしてください。';
      return;
    }
    const iteration = error instanceof TohokuBenchmarkError ? error.iteration : samples.length + 1;
    const reason = error instanceof TohokuBenchmarkError && error.cause instanceof Error
      ? error.cause.message
      : error instanceof Error ? error.message : '不明なエラー';
    tohokuBenchmarkResults.value = `連続生成失敗: ${samples.length}/20 完了、${iteration}回目で停止。${samples.length ? `途中値 ${samples.map((sample) => sample.toFixed(0)).join(', ')} ms` : '生成時間なし'}`;
    tohokuStatus.value = 'TOHOKU Happyの連続生成が停止しました。失敗した文は自由入力欄にあり、既存iOS TTSで比較できます。';
    tohokuError.value = reason;
  } finally {
    tohokuBenchmarkRunning = false;
    tohokuBenchmarkCancelRequested = false;
    tohokuBenchmarkCancelButton.disabled = true;
    const available = tohokuVoiceLab.state === 'ready' || tohokuVoiceLab.state === 'generated';
    tohokuGenerateSampleButton.disabled = !available;
    tohokuGenerateTextButton.disabled = !available;
    tohokuBenchmarkButton.disabled = !available;
  }
}

function applyReaction(event: ReactionEvent): void {
  const reactionAt = performance.now();
  const reaction = reactionEngine.handle(event, performance.now());
  setExpression(reaction.expression === 'LISTENING' || reaction.expression === 'HEARING' ? 'THINK' : reaction.expression);
  if ((event === 'UTTERANCE_DETECTED' || event === 'INTERIM_ACTIVITY') && pendingVisualReactionAt === null) pendingVisualReactionAt = reactionAt;
  if (reaction.blink) {
    state.blink = 1;
    nextBlink = performance.now() + 2400 + Math.random() * 3900;
  }
  if (reaction.mouthOpen > 0) state.mouthOpen = reaction.mouthOpen;
  reactionEvents.push(`${event} → ${reaction.expression}`);
  if (reactionEvents.length > 8) reactionEvents.shift();
  reactionHistory.value = `リアクション履歴: ${reactionEvents.join(' / ')}`;

  if (event === 'FACE_FOUND' || event === 'WAKE') {
    window.clearTimeout(faceReactionTimer);
    faceReactionTimer = window.setTimeout(() => {
      if (state.expression === 'HAPPY' && !reactionEngine.isInteractionActive) setExpression('IDLE');
    }, 950);
  }
}

function scheduleIdleSleep(): void {
  window.clearTimeout(idleSleepTimer);
  idleSleepTimer = window.setTimeout(() => applyReaction('IDLE_TIMEOUT'), 60_000);
}

function updateConversationTiming(): void {
  conversationTiming.value = `返答生成: ${replyGenerationMs.toFixed(1)} ms / TOHOKU生成: ${tohokuGenerationMs?.toFixed(1) ?? '--'} ms / TTS開始: ${ttsStartMs === null ? '--' : `${ttsStartMs.toFixed(1)} ms`} / 発話終了→音声: ${ttsStartDelayMs === null ? '--' : `${ttsStartDelayMs.toFixed(1)} ms`} / 音声イベント→表情: ${voiceReactionMs === null ? '--' : `${voiceReactionMs.toFixed(2)} ms`}`;
  renderLatencySummary();
}

function finishReactionResponse(reason: SpeechEndReason | 'text-only', token: number): void {
  if (tohokuConversationTurnTracked) {
    if (reason === 'finished') {
      if (tohokuConversationTurnFellBack) tohokuConversationFallbacks += 1;
      else tohokuConversationSuccesses += 1;
    } else {
      tohokuConversationFailures += 1;
    }
    tohokuConversationTurnTracked = false;
    tohokuConversationTurnFellBack = false;
  }
  if (reason === 'finished' && voiceResponseActive) {
    ttsEndTurnCount += 1;
    renderLatencySummary();
  }
  applyReaction('RESPONSE_ENDED');
  state.mouthOpen = 0;
  mouthMotionStartedAt = null;
  speechStopButton.disabled = true;
  talking = false;
  recordSpeechStage('mouth-stop', reason);
  if (reason === 'finished') speechStatus.value = '読み上げが終わりました。音声は保存していません。';
  if (reason === 'stopped') speechStatus.value = '読み上げを停止しました。';
  if (reason === 'error') speechStatus.value = '音声を開始または継続できませんでした。診断状態を確認してください。';
  setVisibleAppState(reason === 'finished' && voiceResponseActive && recognitionEnabled
    ? '音声終了・マイク再開中'
    : reason === 'stopped' ? '音声停止・マイクは自動再開しません'
      : reason === 'error' ? `エラー: ${lastErrorCode}` : '待機中');
  if (reason === 'stopped' && voiceResponseActive) {
    recognitionEnabled = false;
    recognitionStatus.value = '読み上げを停止しました。音声認識は自動再開しません。保護者が開始ボタンを押してください。';
    updateRecognitionButtons();
  }
  renderSpeechRuntime();
  renderMediaConcurrency();
  scheduleIdleSleep();
  recordSpeechStage('recognition-resume', voiceResponseActive && recognitionEnabled ? '一度だけ再開を要求' : '対象外/利用者停止');
  if (voiceResponseActive && recognitionEnabled && reason !== 'stopped') {
    voiceResponseActive = false;
    const finishedAt = performance.now();
    window.setTimeout(() => {
      if (token !== conversationGeneration || !debug || !recognitionEnabled || isAnySpeechActive()) return;
      startVoiceRecognition(true);
      latencySamples.record('resume', performance.now() - finishedAt);
      renderLatencySummary();
    }, 250);
  } else {
    voiceResponseActive = false;
  }
}

function speakReply(text: string, token: number): void {
  ttsStartMs = null;
  ttsStartDelayMs = null;
  activeReplyEngineForTurn = replyVoiceMode;
  updateConversationTiming();
  recordSpeechStage('tts-request', `返答${text.length}文字`);
  setVisibleAppState('返答生成完了・音声出力準備中');
  if (!ttsEnabled.checked) {
    speechStatus.value = '読み上げOFF。返答は文字で表示しています。';
    finishReactionResponse('text-only', token);
    return;
  }

  tohokuConversationTurnTracked = voiceResponseActive && replyVoiceMode === 'tohoku';
  tohokuConversationTurnFellBack = false;
  if (tohokuConversationTurnTracked) {
    tohokuConversationAttempts += 1;
    renderLatencySummary();
  }

  if (replyVoiceMode === 'ios' && !speechEngine.isSupported) {
    speechStatus.value = 'このSafariでは音声合成を利用できません。文字の返答は引き続き使えます。';
    finishReactionResponse('error', token);
    return;
  }

  let responseFinished = false;
  ttsRequestedAt = performance.now();
  const callbacks: SpeechCallbacks = {
    onStart: () => {
      if (token !== conversationGeneration) return;
      if (replyVoiceMode === 'tohoku') talking = true;
      recordSpeechStage('tts-start', 'onstart');
      recordSpeechStage('mouth-start', '口パクを開始');
      ttsStartMs = performance.now() - submittedUtteranceEndedAt;
      ttsStartDelayMs = ttsStartMs;
      if (ttsRequestedAt !== null) latencySamples.record('tts', performance.now() - ttsRequestedAt);
      if (utteranceEndAt !== null) {
        latencySamples.record('turn', performance.now() - utteranceEndAt);
        latencySamples.record(`turn-${activeReplyEngineForTurn}`, performance.now() - utteranceEndAt);
      }
      mouthMotionStartedAt = performance.now();
      updateConversationTiming();
      applyReaction('RESPONSE_STARTED');
      speechStopButton.disabled = false;
      renderSpeechRuntime();
      renderMediaConcurrency();
      speechStatus.value = replyVoiceMode === 'tohoku'
        ? 'TOHOKU Happyを再生中です。再生終了後に音声認識を再開します。'
        : 'iOS日本語音声で読み上げています。マイク入力は使用していません。';
      setVisibleAppState(`再生中（${replyVoiceMode === 'tohoku' ? 'TOHOKU Happy' : 'iOS音声'} onstart確認・可聴は端末確認が必要）`);
    },
    onBoundary: () => { /* Mouth animation follows the actual onstart/onend interval. */ },
    onError: (message) => {
      lastErrorCode = replyVoiceMode === 'tohoku' ? 'TOHOKU_PLAYBACK_FAILED' : 'IOS_TTS_ERROR';
      setVisibleAppState(`エラー: ${lastErrorCode}`);
      recordSpeechStage('tts-end', `onerror:${message}`);
      speechStatus.value = `読み上げエラー: ${message}`;
    },
    onEnd: (reason) => {
      if (token !== conversationGeneration || responseFinished) return;
      responseFinished = true;
      recordSpeechStage('tts-end', reason === 'finished' ? 'onend' : reason === 'stopped' ? 'cancel' : 'onerror');
      finishReactionResponse(reason, token);
    },
  };
  if (replyVoiceMode === 'tohoku') {
    if (!tohokuConversationActivated || (tohokuVoiceLab.state !== 'ready' && tohokuVoiceLab.state !== 'generated')) {
      speechStatus.value = 'TOHOKU Happyは未準備のため会話を開始できません。保護者が音声を準備してください。';
      setVisibleAppState('TOHOKU未準備・会話開始を停止');
      recognitionEnabled = false;
      voiceResponseActive = false;
      updateRecognitionButtons();
      return;
    } else {
      speechStatus.value = 'TOHOKU Happyで返答音声を生成しています…';
      setVisibleAppState('TOHOKU音声生成中');
      renderMediaConcurrency();
      void tohokuConversationSpeech.speak(text, callbacks.onStart ?? (() => undefined)).then((result) => {
        if (token !== conversationGeneration) return;
        if (result.generationMs !== undefined) {
          tohokuGenerationMs = result.generationMs;
          latencySamples.record('tohoku-generation', result.generationMs);
          tohokuGenerationSamples.push(result.generationMs);
          renderLatencySummary();
          renderTohokuMetrics();
        }
        if (result.reason === 'error') {
          recordSpeechStage('tts-end', `TOHOKU失敗:${result.error ?? 'unknown'}`);
          speechStatus.value = `TOHOKU Happyを再生できません。iOS標準TTSへ切り替えます。${result.error ?? ''}`;
          lastErrorCode = 'TOHOKU_GENERATION_OR_PLAYBACK_FAILED';
          setVisibleAppState(`iOS音声へ切替: ${lastErrorCode}`);
          tohokuConversationStatus.value = `会話中の失敗からiOS標準TTSへ復帰しました: ${result.error ?? '不明なエラー'}`;
          resetTohokuConversationAudio(`会話中の失敗からiOS標準TTSへ復帰しました: ${result.error ?? '不明なエラー'} Happyモデルを再準備するまでiOS標準TTSを使います。`);
          replyVoiceMode = 'ios';
          replyVoiceEngineSelect.value = 'ios';
          tohokuConversationTurnFellBack = tohokuConversationTurnTracked;
          activeReplyEngineForTurn = 'ios-fallback';
          speakWithNativeTts(text, callbacks);
          return;
        }
        if (responseFinished) return;
        responseFinished = true;
        recordSpeechStage('tts-end', result.reason === 'finished' ? 'TOHOKU onended' : 'TOHOKU cancel');
        callbacks.onEnd?.(result.reason);
      });
    }
  } else {
    speakWithNativeTts(text, callbacks);
  }
  renderSpeechRuntime();
  renderMediaConcurrency();
}

function speakWithNativeTts(
  text: string,
  callbacks: SpeechCallbacks,
): void {
  if (!speechEngine.isSupported) {
    speechStatus.value = 'iOS標準TTSはこの環境で利用できません。返答文は画面に表示しています。';
    callbacks.onEnd?.('error');
    return;
  }
  void speechEngine.speak(text, callbacks, selectedSpeechSettings());
}

async function respondToConversation(text: string, fromVoice = false): Promise<void> {
  if (!debug) return;
  if (!text.trim()) return;
  const token = ++conversationGeneration;
  tohokuAudio?.pause();
  speechEngine.stop();
  tohokuConversationSpeech.stop();
  if (fromVoice) recognitionEngine.abort();
  else {
    recognitionEnabled = false;
    voiceResponseActive = false;
    recognitionEngine.abort();
    updateRecognitionButtons();
  }
  recordSpeechStage('conversation-input', `${fromVoice ? '音声' : '手入力'} ${text.length}文字`);
  scheduleIdleSleep();
  if (!fromVoice) {
    applyReaction('VOICE_INPUT_STARTED');
    applyReaction('UTTERANCE_DETECTED');
    applyReaction('UTTERANCE_ENDED');
    submittedUtteranceEndedAt = performance.now();
  }
  const generationStart = performance.now();
  const result = conversationEngine.reply(text, conversationContext);
  replyGenerationMs = performance.now() - generationStart;
  latencySamples.record('generation', replyGenerationMs);
  conversationContext = result.context;
  recordSpeechStage('reply-generated', `${result.text.length}文字 ${replyGenerationMs.toFixed(1)}ms`);
  conversationReply.value = `確定返答: ${result.text}`;
  updateConversationTiming();
  speakReply(result.text, token);
}

function submitConversation(): Promise<void> {
  if (!debug) return Promise.resolve();
  const text = conversationInput.value.trim();
  if (!text) return Promise.resolve();
  conversationInput.value = '';
  return respondToConversation(text);
}

function testColonVoice(text = 'こんにちは！コロンだよ！きょうはなにしてあそぶ？'): void {
  if (!ttsEnabled.checked) {
    voiceTestStatus.value = '音声テスト: 先に保護者確認のチェックを入れてください。';
    return;
  }
  if (!speechEngine.isSupported) {
    voiceTestStatus.value = '音声テスト: このSafariではSpeechSynthesis非対応です。';
    return;
  }
  // Keep speak() in the button event call stack for Safari's user-activation policy.
  recognitionEnabled = false;
  voiceResponseActive = false;
  recognitionEngine.abort();
  tohokuConversationSpeech.stop();
  updateRecognitionButtons();
  const token = ++conversationGeneration;
  speechEngine.stop();
  submittedUtteranceEndedAt = performance.now();
  recordSpeechStage('tts-request', `音声テスト ${text.length}文字`);
  voiceTestStatus.value = '音声テスト: 開始待ち(onstart前)';
  const pending = speechEngine.speak(text, {
    onStart: () => {
      if (token !== conversationGeneration) return;
      recordSpeechStage('tts-start', '音声テスト onstart');
      recordSpeechStage('mouth-start', '音声テスト口パク開始');
      ttsStartMs = performance.now() - submittedUtteranceEndedAt;
      ttsStartDelayMs = ttsStartMs;
      updateConversationTiming();
      applyReaction('RESPONSE_STARTED');
      speechStopButton.disabled = false;
      voiceTestStatus.value = '音声テスト: 再生中(onstart確認済み)';
      renderSpeechRuntime();
      renderMediaConcurrency();
    },
    onError: (message) => {
      voiceTestStatus.value = `音声テスト: エラー ${message}`;
      recordSpeechStage('tts-end', `音声テスト onerror:${message}`);
    },
    onEnd: (reason) => {
      if (token !== conversationGeneration) return;
      recordSpeechStage('tts-end', `音声テスト ${reason}`);
      recordSpeechStage('mouth-stop', `音声テスト ${reason}`);
      state.mouthOpen = 0;
      speechStopButton.disabled = true;
      if (state.expression === 'TALK') applyReaction('RESPONSE_ENDED');
      voiceTestStatus.value = reason === 'finished' ? '音声テスト: 再生終了(onend確認済み)' : `音声テスト: ${reason}`;
      renderSpeechRuntime();
      renderMediaConcurrency();
    },
  }, selectedSpeechSettings());
  voiceSelectorStatus.value = `試聴中の選択: ${speechEngine.currentVoice ? `${speechEngine.currentVoice.name} (${speechEngine.currentVoice.lang})` : '自動の既定音声'}。音声は端末で確認してください。`;
  renderSpeechRuntime();
  renderMediaConcurrency();
  void pending;
}

function runNativeTtsDiagnostic(): void {
  if (!ttsEnabled.checked) {
    diagnosticResultOutput.value = '診断は未実行: 保護者確認の音声チェックを入れてください。';
    return;
  }
  if (diagnosticOwner || nativeTtsDiagnostic.isActive) {
    diagnosticResultOutput.value = '診断は未実行: 先行する音声診断を停止してから、新しい操作で再試行してください。';
    return;
  }
  if (speechEngine.isSpeaking || speechEngine.isPending || nativeSpeechPort?.speaking || nativeSpeechPort?.pending) {
    diagnosticResultOutput.value = '診断は未実行: 既存音声キューが動作中です。停止ボタンを押し、状態が停止してから別の操作で試してください。';
    return;
  }
  const mode = nativeVoiceMode.value as DiagnosticVoiceMode;
  diagnosticOwner = 'native';
  startDiagnosticPolling();
  diagnosticEvents = [];
  diagnosticResultOutput.value = `直接Web APIを要求: ${mode} / cancel前=${nativeCancelFirst.checked} / 起動時の状態を確認中`;
  appendDiagnosticEvent(`request ${mode} cancel=${nativeCancelFirst.checked}`);
  renderTtsDiagnostic();
  void nativeTtsDiagnostic.run('こんにちは。コロンだよ。', mode, {
    cancelBefore: nativeCancelFirst.checked,
    onEvent: (event: NativeDiagnosticEvent) => {
      appendDiagnosticEvent(`${event.type} ${event.elapsedMs.toFixed(0)}ms${event.error ? ` error=${event.error}` : ''}`);
      diagnosticResultOutput.value = event.type === 'onstart'
        ? `直接Web API: onstart ${event.elapsedMs.toFixed(0)}ms / 再生イベント待機中`
        : diagnosticResultOutput.value;
    },
  }).then((result) => {
    stopDiagnosticPolling();
    diagnosticOwner = null;
    diagnosticResultOutput.value = `直接Web API結果: ${result.outcome} / onstart=${result.onstart} / onend=${result.onend} / 開始=${result.startDelayMs?.toFixed(0) ?? '--'}ms / timeout=${result.timeoutMs}ms / voice=${result.selectedVoice} / error=${result.error ?? '--'} / utterance保持=${nativeTtsDiagnostic.hasUtteranceReference}`;
    appendDiagnosticEvent(`結果 ${result.outcome}`);
  });
}

function runWrapperTtsDiagnostic(): void {
  if (!ttsEnabled.checked) {
    diagnosticResultOutput.value = '診断は未実行: 保護者確認の音声チェックを入れてください。';
    return;
  }
  if (diagnosticOwner || speechEngine.isPending || speechEngine.isSpeaking) {
    diagnosticResultOutput.value = '診断は未実行: 先行する音声診断を停止してから、新しい操作で再試行してください。';
    return;
  }
  if (nativeSpeechPort?.speaking || nativeSpeechPort?.pending) {
    diagnosticResultOutput.value = '診断は未実行: ブラウザー音声キューが動作中です。停止後に再試行してください。';
    return;
  }
  diagnosticOwner = 'wrapper';
  startDiagnosticPolling();
  diagnosticEvents = [];
  const requestedAt = performance.now();
  let wrapperStartedAt: number | null = null;
  let wrapperError: string | null = null;
  diagnosticResultOutput.value = 'OuchiColon SpeechSynthesisEngineへ直接要求しました。onstartを待っています。';
  appendDiagnosticEvent(`wrapper request ${speechEngine.voiceStatus}`);
  renderTtsDiagnostic();
  void speechEngine.speak('こんにちは。コロンだよ。', {
    onStart: () => {
      wrapperStartedAt = performance.now();
      appendDiagnosticEvent(`wrapper onstart ${(performance.now() - requestedAt).toFixed(0)}ms`);
      diagnosticResultOutput.value = `engine: onstart ${(performance.now() - requestedAt).toFixed(0)}ms / 終了イベント待機中 / voice=${speechEngine.currentVoice ? `${speechEngine.currentVoice.name} (${speechEngine.currentVoice.lang})` : '既定'}`;
      renderTtsDiagnostic();
    },
    onError: (message) => {
      wrapperError = message;
      appendDiagnosticEvent(`wrapper onerror ${message}`);
    },
    onEnd: (reason) => {
      stopDiagnosticPolling();
      diagnosticOwner = null;
      diagnosticResultOutput.value = `engine結果: ${reason} / onstart=${wrapperStartedAt !== null} / onend=${reason === 'finished'} / 開始=${wrapperStartedAt === null ? '--' : `${(wrapperStartedAt - requestedAt).toFixed(0)}ms`} / timeout=10000ms / voice=${speechEngine.currentVoice ? `${speechEngine.currentVoice.name} (${speechEngine.currentVoice.lang})` : '既定'} / error=${wrapperError ?? '--'} / browser paused=${speechEngine.isPaused} pending=${speechEngine.browserPending} speaking=${speechEngine.browserSpeaking} / utterance保持=${speechEngine.hasUtteranceReference}`;
      appendDiagnosticEvent(`wrapper ${reason}`);
      renderSpeechRuntime();
    },
  });
  renderTtsDiagnostic();
}

function stopTtsDiagnostic(): void {
  if (diagnosticOwner === 'native') nativeTtsDiagnostic.stopFromUserGesture();
  else if (diagnosticOwner === 'wrapper') speechEngine.stop();
  else {
    try { nativeSpeechPort?.cancel(); } catch { /* Explicit stop remains a recoverable diagnostic action. */ }
  }
  appendDiagnosticEvent('user cancel()');
  renderTtsDiagnostic();
}

function resumeTtsDiagnostic(): void {
  const result = nativeTtsDiagnostic.resumeFromUserGesture();
  diagnosticResultOutput.value = `resume()操作: ${result} / paused=${nativeSpeechPort?.paused ?? '--'} / pending=${nativeSpeechPort?.pending ?? '--'} / speaking=${nativeSpeechPort?.speaking ?? '--'}`;
  appendDiagnosticEvent(`resume ${result}`);
  renderTtsDiagnostic();
}

function queryServiceWorkerVersion(): void {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) {
    workerCacheStatus = '制御なし';
    renderTtsDiagnostic();
    return;
  }
  workerCacheStatus = `応答待ち(${new URL(controller.scriptURL).pathname})`;
  renderTtsDiagnostic();
  const channel = new MessageChannel();
  const timeout = window.setTimeout(() => {
    channel.port1.close();
    workerCacheStatus = 'バージョン応答なし';
    renderTtsDiagnostic();
  }, 1200);
  channel.port1.onmessage = (event: MessageEvent<{ cache?: string }>) => {
    window.clearTimeout(timeout);
    channel.port1.close();
    workerCacheStatus = event.data.cache ?? '応答形式不明';
    renderTtsDiagnostic();
  };
  try { controller.postMessage({ type: 'GET_CACHE_VERSION' }, [channel.port2]); }
  catch {
    window.clearTimeout(timeout);
    workerCacheStatus = '問い合わせ失敗';
    renderTtsDiagnostic();
  }
}

function updateRecognitionButtons(): void {
  recognitionStartButton.disabled = !recognitionEngine.isSupported || recognitionEnabled || recognitionEngine.isActive;
  recognitionStopButton.disabled = !recognitionEngine.isActive && !recognitionEnabled;
}

function startVoiceRecognition(isResume = false): void {
  if (!debug || recognitionEngine.isActive) return;
  if (!recognitionEnabled && !recognitionConsent.checked) {
    recognitionStatus.value = 'オンライン音声認識の説明を確認し、保護者がチェックしてから開始してください。';
    return;
  }
  if (!recognitionEngine.isSupported) {
    recognitionStatus.value = 'このブラウザーはWeb Speech音声認識に対応していません。手入力で会話を試せます。';
    return;
  }
  if (!canStartConversation(replyVoiceMode, tohokuVoiceLab.state === 'ready' || tohokuVoiceLab.state === 'generated', tohokuConversationActivated)) {
    recognitionStatus.value = 'TOHOKU Happyが優先音声です。先に保護者がモデルを準備し、確認音声を再生してください。';
    setVisibleAppState('TOHOKU未準備・会話開始を停止');
    return;
  }
  if (isAnySpeechActive()) {
    recognitionStatus.value = '読み上げ中のためマイク再開を保留しています。';
    recordSpeechStage('recognition-resume', 'TTS中のため開始を拒否');
    return;
  }

  recognitionEnabled = true;
  speechEndHandled = false;
  recognitionInterim.value = '途中認識: --';
  recognitionFinal.value = '最終認識: --';
  recognitionStatus.value = 'マイクを開始しています…';
  setVisibleAppState(isResume ? 'マイク再開中' : 'マイクを開始しています');
  const result = recognitionEngine.start({
    onStart: () => {
      window.clearTimeout(idleSleepTimer);
      recognitionStatus.value = 'マイクON・日本語音声を認識しています。停止ボタンで終了できます。';
      setVisibleAppState('音声認識中');
      updateRecognitionButtons();
      applyReaction('VOICE_INPUT_STARTED');
      recordSpeechStage('microphone', '許可済み/音声入力開始');
      recordSpeechStage('recognition-start', isResume ? '再開成功' : '開始イベント');
      if (isResume) recordSpeechStage('recognition-resume', '開始成功');
      renderMediaConcurrency();
    },
    onSpeechStart: () => {
      const receivedAt = performance.now();
      speechEndHandled = false;
      interimReactionSent = false;
      submittedUtteranceEndedAt = 0;
      utteranceEndAt = null;
      recognitionStatus.value = '声を検出しました。聞いています…';
      setVisibleAppState('発話を検出・聞いています');
      applyReaction('UTTERANCE_DETECTED');
      recordSpeechStage('voice-detected', '発話あり');
      voiceReactionMs = performance.now() - receivedAt;
      updateConversationTiming();
    },
    onSpeechEnd: () => {
      if (speechEndHandled) return;
      speechEndHandled = true;
      submittedUtteranceEndedAt = performance.now();
      utteranceEndAt = submittedUtteranceEndedAt;
      recognitionStatus.value = '発話が終わりました。認識結果を待っています…';
      setVisibleAppState('発話終了・認識確定待ち');
      applyReaction('UTTERANCE_ENDED');
    },
    onInterim: (text) => {
      recognitionInterim.value = `途中認識: ${text || '--'}`;
      recordSpeechStage('interim-result', text ? `${text.length}文字(未確定)` : '空');
      if (text && !interimReactionSent) {
        interimReactionSent = true;
        applyReaction('INTERIM_ACTIVITY');
      }
    },
    onError: (code, message) => {
      lastErrorCode = `SPEECH_RECOGNITION_${code.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
      setVisibleAppState(`エラー: ${lastErrorCode}`);
      recognitionEnabled = false;
      recordSpeechStage('microphone', `失敗:${code}`);
      recordSpeechStage('recognition-start', `失敗:${code}`);
      if (isResume) recordSpeechStage('recognition-resume', `失敗:${code}・手動再開が必要`);
      const detail = code === 'not-allowed' || code === 'service-not-allowed'
        ? 'マイクまたは音声認識が許可されませんでした。Safariのサイト設定をご確認ください。'
        : code === 'network'
          ? 'オンライン音声認識に接続できません。接続を確認するか手入力を使ってください。'
          : `音声認識エラー (${code})。マイク停止後に手入力を試せます。`;
      recognitionStatus.value = message ? `${detail} ${message}` : detail;
      updateRecognitionButtons();
    },
    onEnd: (finalText) => {
      updateRecognitionButtons();
      recognitionInterim.value = '途中認識: --';
      if (finalText) {
        const finalResultAt = performance.now();
        if (utteranceEndAt !== null) latencySamples.record('final', finalResultAt - utteranceEndAt);
        else {
          utteranceEndAt = finalResultAt;
        }
        renderLatencySummary();
        recordSpeechStage('final-result', `${finalText.length}文字`);
        recognitionFinal.value = `最終認識: ${finalText}`;
        recognitionStatus.value = '認識できました。短い返事を考えています…';
        setVisibleAppState('認識確定・返答生成中');
        if (!speechEndHandled) {
          speechEndHandled = true;
          submittedUtteranceEndedAt = performance.now();
          applyReaction('UTTERANCE_ENDED');
        }
        voiceResponseActive = true;
        void respondToConversation(finalText, true);
        return;
      }
      if (reactionEngine.isInteractionActive) applyReaction('RESPONSE_ENDED');
      if (recognitionEnabled) recognitionStatus.value = '発話を認識できませんでした。もう一度マイクで会話を開始してください。';
      recognitionEnabled = false;
      recordSpeechStage('final-result', '最終結果なし');
      scheduleIdleSleep();
      updateRecognitionButtons();
    },
  });

  if (result === 'unsupported') {
    recognitionEnabled = false;
    recognitionStatus.value = 'このブラウザーはWeb Speech音声認識に対応していません。';
  } else if (result === 'error') {
    recognitionEnabled = false;
    if (!recognitionStatus.value.includes('エラー') && !recognitionStatus.value.includes('許可されません')) {
      recognitionStatus.value = '音声認識を開始できませんでした。設定を確認して再試行してください。';
    }
  } else {
    if (!isResume) recordSpeechStage('recognition-start', '開始要求');
    recognitionStatus.value = 'Safariにマイク許可を求めています…';
  }
  updateRecognitionButtons();
  renderMediaConcurrency();
}

function stopVoiceRecognition(): void {
  recognitionEnabled = false;
  voiceResponseActive = false;
  recognitionEngine.abort();
  recognitionStatus.value = 'マイクを停止しました。OuchiColonは音声を保存していません。';
  setVisibleAppState('マイク停止');
  recognitionInterim.value = '途中認識: --';
  updateRecognitionButtons();
  recordSpeechStage('recognition-resume', 'マイク停止・自動再開禁止');
  renderMediaConcurrency();
  if (reactionEngine.isInteractionActive) applyReaction('RESPONSE_ENDED');
  renderMediaConcurrency();
  scheduleIdleSleep();
}

function renderTrackingStatus(detail: string): void {
  trackingStatus.value = `カメラ ${cameraActive ? 'ON' : 'OFF'} / 検出 ${detectorActive ? 'ON' : 'OFF'} / ${detail}`;
}

function onFaceTrackingInput(input: FaceTrackingInput): void {
  if (!detectorActive) return;
  const stableInput = faceStabilizer.update(input);
  if (!stableInput.faceDetected) {
    targetGazeX = 0;
    targetGazeY = 0;
    if (!trackingFaceKnown || trackingSawFace) applyReaction('FACE_LOST');
    trackingFaceKnown = true;
    trackingSawFace = false;
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
    trackingFaceKnown = true;
    applyReaction('FACE_FOUND');
    scheduleIdleSleep();
  }
}

const faceTracker = new MediaPipeFaceTracker(
  onFaceTrackingInput,
  (message) => {
    if (message.startsWith('顔検出でエラー')) {
      detectorActive = false;
      if (trackingSawFace) applyReaction('FACE_LOST');
      trackingSawFace = false;
      trackingFaceKnown = false;
      targetGazeX = 0;
      targetGazeY = 0;
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
    lastErrorCode = 'CAMERA_START_FAILED';
    setVisibleAppState(`エラー: ${lastErrorCode}`);
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
    trackingFaceKnown = false;
  } catch (error) {
    detectorActive = false;
    lastErrorCode = error instanceof DOMException ? 'CAMERA_PERMISSION_FAILED' : 'FACE_DETECTOR_START_FAILED';
    setVisibleAppState(`エラー: ${lastErrorCode}`);
    trackingStatus.value = error instanceof DOMException ? cameraFailureMessage(error) : detectorFailureMessage(error);
  } finally {
    trackingStarting = false;
    updateTrackingButtons();
  }
}

async function stopDetection(): Promise<void> {
  if (!detectorActive) return;
  detectorActive = false;
  if (trackingSawFace) applyReaction('FACE_LOST');
  trackingSawFace = false;
  trackingFaceKnown = false;
  targetGazeX = 0;
  targetGazeY = 0;
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
  if (trackingSawFace) applyReaction('FACE_LOST');
  trackingSawFace = false;
  trackingFaceKnown = false;
  targetGazeX = 0;
  targetGazeY = 0;
  faceStabilizer.reset();
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
  if (!value) {
    nativeTtsDiagnostic.stopFromUserGesture();
    stopVoiceRecognition();
    speechEngine.stop();
    resetTohokuConversationAudio('デバッグ画面を閉じました。再表示後、保護者がTOHOKU音声を再有効化してください。', false);
    conversationGeneration += 1;
    conversationContext = { topic: null, turn: 0 };
    conversationInput.value = '';
    recognitionInterim.value = '途中認識: --';
    recognitionFinal.value = '最終認識: --';
    conversationReply.value = '確定返答: --';
    if (reactionEngine.isInteractionActive) applyReaction('RESPONSE_ENDED');
    void stopCamera();
  }
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
  if (pendingVisualReactionAt !== null) {
    latencySamples.record('reaction', Math.max(0, now - pendingVisualReactionAt));
    pendingVisualReactionAt = null;
    renderLatencySummary();
  }
  if (talking && state.expression === 'TALK') {
    mouthMotionStartedAt ??= now;
    state.mouthOpen = speechMouthTarget(now, mouthMotionStartedAt);
  } else if (speechEngine.isSpeaking && state.expression === 'TALK' && diagnosticOwner !== 'wrapper') {
    mouthMotionStartedAt ??= now;
    const target = speechMouthTarget(now, mouthMotionStartedAt);
    state.mouthOpen += (target - state.mouthOpen) * Math.min(1, dt * 12);
  } else if (!debug) {
    mouthMotionStartedAt = null;
    state.mouthOpen += (0 - state.mouthOpen) * Math.min(1, dt * 7);
  }
  renderer.draw(state, now);
  const fps = fpsMeter.addFrame(now);
  if (fps !== null) {
    latestRenderFps = fps;
    fpsOutput.value = `描画 ${fps} FPS / 検出 ${detectionFps.toFixed(1)} FPS / 遅延 ${detectionLatencyMs} ms`;
    renderMediaConcurrency();
  }
  if (debug && detectorActive) {
    trackingCoordinates.value = `顔座標: ${trackingCoordinates.value.replace(/^顔座標: /, '').split(' / 視線')[0]} / 視線 ${state.gazeX.toFixed(2)}, ${state.gazeY.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}

function speechMouthTarget(now: number, startedAt: number): number {
  const elapsed = Math.max(0, now - startedAt);
  const onset = Math.min(1, elapsed / 120);
  const syllable = (Math.sin(elapsed / 83) + 1) / 2;
  const secondary = (Math.sin(elapsed / 137 + 1.2) + 1) / 2;
  const phrase = 0.55 + 0.45 * ((Math.sin(elapsed / 430 + 0.5) + 1) / 2);
  return onset * (0.08 + phrase * (0.14 + syllable * 0.34 + secondary * 0.12));
}

buildDebugControls();
setDebug(debug);
document.querySelector('#close-debug')!.addEventListener('click', () => setDebug(false));
assembleQuickActions();
setVisibleAppState(visibleAppState);
diagnosticCopyButton.addEventListener('click', () => { void copyDiagnosticReport(); });
minimizeDebugButton.addEventListener('click', () => {
  const minimized = debugPanel.classList.toggle('debug--minimized');
  minimizeDebugButton.innerHTML = `${minimized ? ACTION_ICONS.gear : ACTION_ICONS.face}${minimized ? '設定' : '顔を見る'}`;
  minimizeDebugButton.setAttribute('aria-label', minimized ? '設定パネルを開く' : '顔を見やすくする');
});
cameraStartButton.addEventListener('click', () => { void startCamera(); });
cameraStopButton.addEventListener('click', () => { void stopCamera(); });
detectorStartButton.addEventListener('click', () => { void startDetection(); });
detectorStopButton.addEventListener('click', () => { void stopDetection(); });
conversationSendButton.addEventListener('click', () => { void submitConversation(); });
conversationInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void submitConversation();
  }
});
speechStopButton.addEventListener('click', () => {
  speechEngine.stop();
  tohokuConversationSpeech.stop();
  tohokuAudio?.pause();
});
voiceTestButton.addEventListener('click', () => testColonVoice());
voiceAuditionButton.addEventListener('click', () => testColonVoice());
voiceProfile.addEventListener('change', () => {
  const profile = VOICE_PROFILES[voiceProfile.value] ?? VOICE_PROFILES.gentle!;
  voiceRate.value = String(profile.rate);
  voicePitch.value = String(profile.pitch);
  voiceVolume.value = String(profile.volume);
  voiceSelectorStatus.value = `${voiceProfile.selectedOptions[0]?.textContent ?? '音声プロファイル'}を選びました。設定は仮値です。`;
});
voiceChoice.addEventListener('change', () => {
  const voice = speechEngine.voices.find((candidate) => candidate.voiceURI === voiceChoice.value);
  voiceSelectorStatus.value = voice
    ? `${voice.name} (${voice.lang})を試聴できます。iPhoneで聴いて調整してください。`
    : '自動選択です。従来のja-JP既定音声にフォールバックします。';
});
renderVoiceChoices();
renderLatencySummary();
document.querySelector<HTMLButtonElement>('#latency-clear')!.addEventListener('click', () => {
  latencySamples.clear();
  ttsEndTurnCount = 0;
  renderLatencySummary();
});
tohokuInitButton.addEventListener('click', () => { void initializeTohokuLab(); });
tohokuConversationEnableButton.addEventListener('click', () => { void enableTohokuConversationAudio(); });
tohokuStopButton.addEventListener('click', () => {
  if (tohokuBenchmarkRunning) tohokuBenchmarkCancelRequested = true;
  tohokuVoiceLab.stop();
  tohokuConversationSpeech.close();
  tohokuConversationActivated = false;
  replyVoiceMode = fallbackReplyVoice();
  replyVoiceEngineSelect.value = 'ios';
  replyVoiceEngineSelect.options[1]!.disabled = true;
  tohokuConversationEnableButton.disabled = true;
  tohokuConversationStatus.value = 'TOHOKUを停止しました。通常会話はiOS標準TTSへ戻りました。';
  tohokuAudio?.pause();
  tohokuAudio = null;
  if (tohokuAudioUrl) URL.revokeObjectURL(tohokuAudioUrl);
  tohokuAudioUrl = null;
  tohokuPlayButton.disabled = true;
  tohokuPlayStopButton.disabled = true;
  tohokuGenerateSampleButton.disabled = true;
  tohokuGenerateTextButton.disabled = true;
  tohokuBenchmarkButton.disabled = true;
  tohokuInitButton.disabled = false;
  tohokuStopButton.disabled = true;
  tohokuStatus.value = tohokuVoiceLab.status;
});
tohokuGenerateSampleButton.addEventListener('click', () => { void generateTohokuAudio(tohokuSample.value); });
tohokuGenerateTextButton.addEventListener('click', () => { void generateTohokuAudio(tohokuText.value); });
tohokuBenchmarkButton.addEventListener('click', () => { void runTohokuTwentyGenerationBenchmark(); });
tohokuBenchmarkCancelButton.addEventListener('click', () => {
  tohokuBenchmarkCancelRequested = true;
  tohokuBenchmarkCancelButton.disabled = true;
  tohokuStatus.value = '中断要求を受け付けました。進行中の1回が完了した時点で止め、Workerと辞書を保持します。';
});
tohokuPlayButton.addEventListener('click', () => {
  if (!tohokuAudio) return;
  tohokuPlayRequestedAt = performance.now();
  tohokuAudio.currentTime = 0;
  void tohokuAudio.play().catch((error: unknown) => {
    tohokuPlayRequestedAt = null;
    tohokuStatus.value = 'Safariが音声再生を開始しませんでした。再生ボタンをもう一度押してください。';
    tohokuError.value = error instanceof Error ? error.message : 'WAVの再生に失敗しました。';
  });
});
tohokuPlayStopButton.addEventListener('click', () => {
  tohokuAudio?.pause();
  tohokuPlayStopButton.disabled = true;
  tohokuStatus.value = '生成音声の再生を停止しました。Workerと生成音声は保持しています。';
});
tohokuFallbackButton.addEventListener('click', () => testColonVoice(tohokuText.value.trim() || tohokuSample.value));
replyVoiceEngineSelect.addEventListener('change', () => {
  const previousMode = replyVoiceMode;
  replyVoiceMode = replyVoiceEngineSelect.value === 'tohoku' && tohokuConversationActivated ? 'tohoku' : 'ios';
  if (replyVoiceMode === 'ios' && replyVoiceEngineSelect.value !== 'ios') replyVoiceEngineSelect.value = 'ios';
  if (previousMode === 'tohoku' && replyVoiceMode === 'ios' && tohokuConversationSpeech.isBusy) {
    const token = ++conversationGeneration;
    tohokuConversationSpeech.stop();
    finishReactionResponse('stopped', token);
  }
  tohokuConversationStatus.value = replyVoiceMode === 'tohoku'
    ? '通常会話はTOHOKU Happyを使います。生成・再生に失敗した場合はこのターンからiOS標準TTSへ戻ります。'
    : '通常会話はiOS標準TTSです。';
  renderSpeechRuntime();
});
nativeTtsRunButton.addEventListener('click', runNativeTtsDiagnostic);
wrapperTtsRunButton.addEventListener('click', runWrapperTtsDiagnostic);
diagnosticStopButton.addEventListener('click', stopTtsDiagnostic);
diagnosticResumeButton.addEventListener('click', resumeTtsDiagnostic);
recognitionStartButton.addEventListener('click', () => startVoiceRecognition());
recognitionStopButton.addEventListener('click', stopVoiceRecognition);
recognitionConsent.addEventListener('change', () => {
  if (!recognitionConsent.checked && recognitionEnabled) stopVoiceRecognition();
});
document.querySelectorAll<HTMLButtonElement>('[data-reaction-event]').forEach((button) => {
  button.addEventListener('click', () => {
    const eventName = button.dataset.reactionEvent as ReactionEvent | undefined;
    if (!eventName) return;
    scheduleIdleSleep();
    applyReaction(eventName);
  });
});
speechStatus.value = speechEngine.isSupported
  ? '音声合成に対応しています。読み上げはチェック後、送信操作でのみ開始します。'
  : '音声合成は非対応です。文字入力で会話を試せます。';
recognitionStatus.value = recognitionEngine.isSupported
  ? '保護者がオンライン音声認識に同意し、開始ボタンを押すとマイクを使用します。'
  : 'このブラウザーはWeb Speech音声認識に対応していません。手入力で会話を試せます。';
updateRecognitionButtons();
renderSpeechRuntime();
renderMediaConcurrency();
renderSpeechDiagnostics();
renderTtsDiagnostic();
nativeSpeechPort?.addEventListener?.('voiceschanged', renderTtsDiagnostic);
navigator.serviceWorker?.addEventListener('controllerchange', queryServiceWorkerVersion);
queryServiceWorkerVersion();
scheduleIdleSleep();
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
  if (state.expression === 'SLEEP') {
    applyReaction('WAKE');
    scheduleIdleSleep();
    return;
  }
  setExpression('HAPPY');
  window.setTimeout(() => setExpression('IDLE'), 1300);
  scheduleIdleSleep();
});

document.addEventListener('visibilitychange', () => {
  renderTtsDiagnostic();
  if (document.hidden) {
    nativeTtsDiagnostic.stopFromUserGesture();
    talking = false;
    stopVoiceRecognition();
    speechEngine.stop();
    resetTohokuConversationAudio('ページが非表示になったため会話用音声を停止しました。戻ったら保護者が再度有効化してください。', false);
    conversationGeneration += 1;
    if (reactionEngine.isInteractionActive) applyReaction('RESPONSE_ENDED');
    void stopCamera();
  }
});
window.addEventListener('pagehide', () => {
  nativeTtsDiagnostic.stopFromUserGesture();
  recognitionEnabled = false;
  recognitionEngine.abort();
  speechEngine.stop();
  resetTohokuConversationAudio('ページを離れたため会話用音声を停止しました。', false);
  void stopCamera();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const hasController = Boolean(navigator.serviceWorker.controller);
    if (hadController && hasController) location.reload();
    hadController = hasController;
  });
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/ouchi-colon/sw.js', { scope: '/ouchi-colon/' }).then(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) location.reload();
    });
  });
}

requestAnimationFrame(frame);
