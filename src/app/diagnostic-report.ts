export interface DiagnosticReportInput {
  appVersion: string;
  commit: string;
  serviceWorker: string;
  voiceEngine: string;
  tohokuModel: string;
  microphone: 'ON' | 'OFF';
  camera: 'ON' | 'OFF';
  lastGenerationMs: number | null;
  lastPlaybackStartMs: number | null;
  conversationTurns: number;
  errorCode: string;
  fallbackCount: number;
  microphoneResume: string;
  conversationEngine: string;
  conversationTopic: string;
  conversationIntent: string;
  replyType: string;
  recentQuestionRate: number | null;
  duplicateReplyCount: number;
  conversationFallbackCount: number;
}

const safe = (value: string): string => String(value ?? 'UNKNOWN').replace(/[\r\n]/g, ' ').slice(0, 160);
const duration = (value: number | null): string => value === null || !Number.isFinite(value) ? 'UNKNOWN' : `${Math.round(value)} ms`;

/** Builds a deliberately allow-listed support report. Do not add transcripts or media here. */
export function createDiagnosticReport(input: DiagnosticReportInput): string {
  return [
    `OuchiColon ${safe(input.appVersion)} (${safe(input.commit)})`,
    `Service Worker: ${safe(input.serviceWorker)}`,
    `音声エンジン: ${safe(input.voiceEngine)}`,
    `TOHOKUモデル: ${safe(input.tohokuModel)}`,
    `マイク: ${input.microphone} / カメラ: ${input.camera}`,
    `直近の生成時間: ${duration(input.lastGenerationMs)}`,
    `直近の再生開始時間: ${duration(input.lastPlaybackStartMs)}`,
    `連続会話回数: ${Math.max(0, Math.floor(input.conversationTurns))}`,
    `エラーコード: ${safe(input.errorCode || 'なし')}`,
    `フォールバック回数: ${Math.max(0, Math.floor(input.fallbackCount))}`,
    `マイク再開状態: ${safe(input.microphoneResume || 'UNKNOWN')}`,
    `会話エンジン: ${safe(input.conversationEngine)}`,
    `会話話題: ${safe(input.conversationTopic)}`,
    `発言意図: ${safe(input.conversationIntent)}`,
    `返答タイプ: ${safe(input.replyType)}`,
    `直近の質問率: ${input.recentQuestionRate === null ? 'UNKNOWN' : `${Math.round(Math.max(0, Math.min(1, input.recentQuestionRate)) * 100)}%`}`,
    `直近の重複返答数: ${Math.max(0, Math.floor(input.duplicateReplyCount))}`,
    `会話フォールバック回数: ${Math.max(0, Math.floor(input.conversationFallbackCount))}`,
  ].join('\n');
}
