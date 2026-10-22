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
}

const safe = (value: string): string => value.replace(/[\r\n]/g, ' ').slice(0, 160);
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
  ].join('\n');
}
