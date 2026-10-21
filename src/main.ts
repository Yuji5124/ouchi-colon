import { FaceRenderer, expressions, type Expression, type FaceState } from './character/face-renderer';
import { FpsMeter } from './app/fps-meter';
import { FaceTrackingStabilizer, smoothGaze, toFaceGazeTarget, type FaceTrackingInput } from './vision/face-tracking-input';
import { MediaPipeFaceTracker, type FaceTrackerMetrics } from './vision/media-pipe-face-tracker';
import { cameraFailureMessage, detectorFailureMessage } from './vision/tracking-errors';
import { EMPTY_CONVERSATION_CONTEXT, RuleBasedConversationEngine, type ConversationContext } from './conversation/conversation-engine';
import { ReactionEngine, type ReactionEvent } from './reaction/reaction-engine';
import { SpeechRecognitionEngine } from './speech/speech-recognition-engine';
import { SpeechSynthesisEngine, type SpeechEndReason } from './speech/speech-synthesis-engine';
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
let conversationContext: ConversationContext = { ...EMPTY_CONVERSATION_CONTEXT };
let conversationGeneration = 0;
let idleSleepTimer = 0;
let faceReactionTimer = 0;
let submittedUtteranceEndedAt = 0;
let replyGenerationMs = 0;
let ttsStartMs: number | null = null;
let ttsStartDelayMs: number | null = null;
let voiceReactionMs: number | null = null;
let recognitionEnabled = false;
let voiceResponseActive = false;
let speechEndHandled = false;
const reactionEvents: string[] = [];
let detectionFps = 0;
let detectionLatencyMs = 0;
let latestRenderFps: number | null = null;

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
const voiceTestStatus = document.querySelector<HTMLOutputElement>('#voice-test-status')!;
const ttsEnabled = document.querySelector<HTMLInputElement>('#tts-enabled')!;
const reactionHistory = document.querySelector<HTMLOutputElement>('#reaction-history')!;
const voiceTestButton = document.querySelector<HTMLButtonElement>('#voice-test')!;
const speechRuntimeOutput = document.querySelector<HTMLOutputElement>('#speech-runtime')!;
const speechStagesOutput = document.querySelector<HTMLOutputElement>('#speech-stages')!;
const speechDiagnosticsOutput = document.querySelector<HTMLOutputElement>('#speech-diagnostics')!;
const mediaConcurrencyOutput = document.querySelector<HTMLOutputElement>('#media-concurrency')!;

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
  const local = speechEngine.isSpeaking ? '再生中(onstart済み)'
    : speechEngine.isPending ? '開始待ち'
      : '停止中';
  const voice = speechEngine.voiceStatus === 'japanese-voice-ready' ? 'ja音声あり'
    : speechEngine.voiceStatus === 'loading' ? 'voice一覧待ち'
      : speechEngine.voiceStatus === 'system-default' ? 'ja音声なし・ja-JP既定音声'
        : '音声合成非対応';
  speechRuntimeOutput.value = `音声状態: ${local} / paused=${speechEngine.isPaused} / browser speaking=${speechEngine.browserSpeaking} / pending=${speechEngine.browserPending} / ${voice}`;
}

function renderMediaConcurrency(): void {
  mediaConcurrencyOutput.value = `カメラ ${cameraActive ? 'ON' : 'OFF'} / 顔検出 ${detectorActive ? 'ON' : 'OFF'} / 認識 ${recognitionEngine.isActive ? 'ON' : 'OFF'} / TTS ${speechEngine.isSpeaking ? '再生中' : speechEngine.isPending ? '開始待ち' : 'OFF'} / 描画 ${latestRenderFps?.toFixed(1) ?? '--'} FPS`;
}

speechEngine.onVoicesChanged(() => {
  recordSpeechStage('tts-request', `voice一覧更新:${speechEngine.voiceStatus}`);
  renderSpeechRuntime();
});

function applyReaction(event: ReactionEvent): void {
  const reaction = reactionEngine.handle(event, performance.now());
  setExpression(reaction.expression === 'LISTENING' ? 'THINK' : reaction.expression);
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
  conversationTiming.value = `返答生成: ${replyGenerationMs.toFixed(1)} ms / TTS開始: ${ttsStartMs === null ? '--' : `${ttsStartMs.toFixed(1)} ms`} / 発話終了→音声: ${ttsStartDelayMs === null ? '--' : `${ttsStartDelayMs.toFixed(1)} ms`} / 音声イベント→表情: ${voiceReactionMs === null ? '--' : `${voiceReactionMs.toFixed(2)} ms`}`;
}

function finishReactionResponse(reason: SpeechEndReason | 'text-only', token: number): void {
  applyReaction('RESPONSE_ENDED');
  state.mouthOpen = 0;
  speechStopButton.disabled = true;
  talking = false;
  recordSpeechStage('mouth-stop', reason);
  if (reason === 'finished') speechStatus.value = '読み上げが終わりました。音声は保存していません。';
  if (reason === 'stopped') speechStatus.value = '読み上げを停止しました。';
  if (reason === 'error') speechStatus.value = '音声を開始または継続できませんでした。診断状態を確認してください。';
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
    window.setTimeout(() => {
      if (token !== conversationGeneration || !debug || !recognitionEnabled || speechEngine.shouldSuppressRecognition) return;
      startVoiceRecognition(true);
    }, 250);
  } else {
    voiceResponseActive = false;
  }
}

function speakReply(text: string, token: number): void {
  ttsStartMs = null;
  ttsStartDelayMs = null;
  updateConversationTiming();
  recordSpeechStage('tts-request', `返答${text.length}文字`);
  if (!ttsEnabled.checked) {
    speechStatus.value = '読み上げOFF。返答は文字で表示しています。';
    finishReactionResponse('text-only', token);
    return;
  }

  if (!speechEngine.isSupported) {
    speechStatus.value = 'このSafariでは音声合成を利用できません。文字の返答は引き続き使えます。';
    finishReactionResponse('error', token);
    return;
  }

  let responseFinished = false;
  void speechEngine.speak(text, {
    onStart: () => {
      if (token !== conversationGeneration) return;
      recordSpeechStage('tts-start', 'onstart');
      recordSpeechStage('mouth-start', '口パクを開始');
      ttsStartMs = performance.now() - submittedUtteranceEndedAt;
      ttsStartDelayMs = ttsStartMs;
      updateConversationTiming();
      applyReaction('RESPONSE_STARTED');
      speechStopButton.disabled = false;
      renderSpeechRuntime();
      renderMediaConcurrency();
      speechStatus.value = 'iOS日本語音声で読み上げています。マイク入力は使用していません。';
    },
    onBoundary: () => { /* Mouth animation follows the actual onstart/onend interval. */ },
    onError: (message) => {
      recordSpeechStage('tts-end', `onerror:${message}`);
      speechStatus.value = `読み上げエラー: ${message}`;
    },
    onEnd: (reason) => {
      if (token !== conversationGeneration || responseFinished) return;
      responseFinished = true;
      recordSpeechStage('tts-end', reason === 'finished' ? 'onend' : reason === 'stopped' ? 'cancel' : 'onerror');
      finishReactionResponse(reason, token);
    },
  });
  renderSpeechRuntime();
  renderMediaConcurrency();
}

async function respondToConversation(text: string, fromVoice = false): Promise<void> {
  if (!debug) return;
  if (!text.trim()) return;
  const token = ++conversationGeneration;
  speechEngine.stop();
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

function testColonVoice(): void {
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
  updateRecognitionButtons();
  const token = ++conversationGeneration;
  speechEngine.stop();
  submittedUtteranceEndedAt = performance.now();
  recordSpeechStage('tts-request', '音声テスト 14文字');
  voiceTestStatus.value = '音声テスト: 開始待ち(onstart前)';
  const pending = speechEngine.speak('こんにちは！コロンだよ！', {
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
  });
  renderSpeechRuntime();
  renderMediaConcurrency();
  void pending;
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
  if (speechEngine.shouldSuppressRecognition) {
    recognitionStatus.value = '読み上げ中のためマイク再開を保留しています。';
    recordSpeechStage('recognition-resume', 'TTS中のため開始を拒否');
    return;
  }

  recognitionEnabled = true;
  speechEndHandled = false;
  recognitionInterim.value = '途中認識: --';
  recognitionFinal.value = '最終認識: --';
  recognitionStatus.value = 'マイクを開始しています…';
  const result = recognitionEngine.start({
    onStart: () => {
      window.clearTimeout(idleSleepTimer);
      recognitionStatus.value = 'マイクON・日本語音声を認識しています。停止ボタンで終了できます。';
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
      submittedUtteranceEndedAt = 0;
      recognitionStatus.value = '声を検出しました。聞いています…';
      applyReaction('UTTERANCE_DETECTED');
      recordSpeechStage('voice-detected', '発話あり');
      voiceReactionMs = performance.now() - receivedAt;
      updateConversationTiming();
    },
    onSpeechEnd: () => {
      if (speechEndHandled) return;
      speechEndHandled = true;
      submittedUtteranceEndedAt = performance.now();
      recognitionStatus.value = '発話が終わりました。認識結果を待っています…';
      applyReaction('UTTERANCE_ENDED');
    },
    onInterim: (text) => {
      recognitionInterim.value = `途中認識: ${text || '--'}`;
      recordSpeechStage('interim-result', text ? `${text.length}文字(未確定)` : '空');
    },
    onError: (code, message) => {
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
        recordSpeechStage('final-result', `${finalText.length}文字`);
        recognitionFinal.value = `最終認識: ${finalText}`;
        recognitionStatus.value = '認識できました。短い返事を考えています…';
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
    stopVoiceRecognition();
    speechEngine.stop();
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
  if (talking && state.expression === 'TALK') {
    state.mouthOpen = 0.12 + (Math.sin(now / 115) + 1) * 0.31;
  } else if (speechEngine.isSpeaking && state.expression === 'TALK') {
    state.mouthOpen = 0.12 + (Math.sin(now / 105) + 1) * 0.31;
  } else if (!debug) {
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
conversationSendButton.addEventListener('click', () => { void submitConversation(); });
conversationInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void submitConversation();
  }
});
speechStopButton.addEventListener('click', () => speechEngine.stop());
voiceTestButton.addEventListener('click', testColonVoice);
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
  if (document.hidden) {
    talking = false;
    stopVoiceRecognition();
    speechEngine.stop();
    conversationGeneration += 1;
    if (reactionEngine.isInteractionActive) applyReaction('RESPONSE_ENDED');
    void stopCamera();
  }
});
window.addEventListener('pagehide', () => {
  recognitionEnabled = false;
  recognitionEngine.abort();
  speechEngine.stop();
  void stopCamera();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/ouchi-colon/sw.js', { scope: '/ouchi-colon/' }).then(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) location.reload();
    });
  });
}

requestAnimationFrame(frame);
