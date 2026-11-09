interface ProbeTrack { stop(): void; readyState?: string }
export interface ProbeStream { getTracks(): ProbeTrack[]; getAudioTracks(): ProbeTrack[] }
export type MicrophoneRequest = (constraints: { audio: true; video: false }) => Promise<ProbeStream>;
export interface MicrophoneProbeResult { ok: boolean; code: string; message: string }

export function recognitionServiceGuidance(code: string): string | null {
  if (code === 'service-not-allowed') return '音声認識を開始できません。このブラウザーが認識サービスの利用を拒否しました。マイク単体の許可とは別です。「接続・操作」の音声診断を確認してください。ブラウザー側の対応が必要な場合はWeb画面から解除できません。';
  if (code === 'not-allowed') return 'マイクまたは音声入力が許可されませんでした。使用中のブラウザーの権限を確認し、「接続・操作」のマイク診断を試してください。';
  return null;
}

/** Obtain and immediately close an audio track. No recording, upload, or recognition. */
export async function probeMicrophone(request: MicrophoneRequest | undefined, options: { secure: boolean; signal?: AbortSignal; timeoutMs?: number }): Promise<MicrophoneProbeResult> {
  const result = (ok: boolean, code: string, message: string) => ({ ok, code, message });
  if (!options.secure) return result(false, 'insecure', 'マイク確認にはHTTPSが必要です。');
  if (!request) return result(false, 'unsupported', 'このブラウザーはマイク取得APIを提供していません。');
  if (options.signal?.aborted) return result(false, 'cancelled', 'マイク確認を中止しました。');
  let live = true, stream: ProbeStream | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const close = (s: ProbeStream) => { for (const track of s.getTracks()) { try { track.stop(); } catch { /* Close the remaining tracks too. */ } } };
  try {
    const pending = request({ audio: true, video: false }).then(s => { if (!live) close(s); return s; });
    const interruption = new Promise<never>((_, reject) => {
      cancel = () => reject({ name: 'AbortError' });
      options.signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => reject({ name: 'TimeoutError' }), options.timeoutMs ?? 12000);
    });
    stream = await Promise.race([pending, interruption]);
    if (!stream.getAudioTracks().some(track => track.readyState !== 'ended')) return result(false, 'no-audio-track', '有効なマイク入力を取得できませんでした。');
    return result(true, 'ready', 'マイクの取得に成功しました。入力はすぐ停止しました。録音・送信はしていません。音声認識は次のボタンで別に確認します。');
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown';
    const message = name === 'NotAllowedError' ? 'マイクが許可されませんでした。Bluefyなど使用中のブラウザーの権限を確認してください。'
      : name === 'NotFoundError' ? 'マイクが見つかりませんでした。'
      : name === 'NotReadableError' ? 'マイクを取得できません。他の録音・通話を終了して再確認してください。'
      : name === 'AbortError' ? 'マイク確認を中止しました。'
      : name === 'TimeoutError' ? 'マイクの許可応答を確認できませんでした。後から許可された入力も停止します。'
      : 'マイクの取得に失敗しました。ブラウザーの対応と権限を確認してください。';
    return result(false, name, message);
  } finally {
    live = false; clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); if (stream) close(stream);
  }
}
