import { probeMicrophone, recognitionServiceGuidance } from '../speech/microphone-probe.ts';
import { SpeechRecognitionEngine } from '../speech/speech-recognition-engine.ts';

export function mountPhoneDiagnostics(root: HTMLElement, hooks: { idle: () => boolean; stop: () => void }) {
  const section = document.createElement('details');
  section.innerHTML = `<summary>マイク・音声の接続診断</summary>
    <p>マイク許可、音声認識、返答音声は別々に確認します。</p>
    <button type="button" data-probe="mic">① マイク許可を確認</button><output data-result="mic">マイク：未確認</output>
    <label><input type="checkbox" data-probe-consent> 保護者確認：オンライン音声認識を試す（音声がブラウザーの認識サービスへ送られる場合があります）</label>
    <button type="button" data-probe="recognition">② 音声認識を確認</button><output data-result="recognition">音声認識：未確認</output>
    <button type="button" data-probe="prepare">③ TOHOKU準備</button><button type="button" data-probe="output">④ 返答音声を有効化</button>
    <output data-result="output"></output><button type="button" data-probe="cancel">診断を停止</button>
    <p>診断中は駆動許可と会話を解除します。会話は保護者が再開してください。音声認識の拒否をマイク許可の成功で解除することはできません。</p>`;
  root.append(section);
  const micOutput = section.querySelector<HTMLOutputElement>('[data-result="mic"]')!;
  const recognitionOutput = section.querySelector<HTMLOutputElement>('[data-result="recognition"]')!;
  const audioOutput = section.querySelector<HTMLOutputElement>('[data-result="output"]')!;
  const recognizer = new SpeechRecognitionEngine();
  let generation = 0, mic: AbortController | null = null, recognitionTimer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    generation++; mic?.abort(); mic = null; clearTimeout(recognitionTimer); recognizer.abort();
  };
  function prepare() {
    if (!hooks.idle()) { recognitionOutput.value = 'モーターを停止してから診断してください。'; return false; }
    cancel(); hooks.stop();
    document.querySelector<HTMLButtonElement>('#recognition-stop')?.click();
    document.querySelector<HTMLButtonElement>('#speech-stop')?.click();
    return true;
  }
  section.querySelector<HTMLButtonElement>('[data-probe="mic"]')!.onclick = async () => {
    if (!prepare()) return;
    const current = generation; mic = new AbortController(); micOutput.value = 'マイクへのアクセスを要求しています…';
    const devices = navigator.mediaDevices;
    const result = await probeMicrophone(devices?.getUserMedia?.bind(devices), { secure: window.isSecureContext, signal: mic.signal });
    if (current === generation) { mic = null; micOutput.value = `${result.ok ? '取得成功' : '未取得'} (${result.code})：${result.message}`; }
  };
  section.querySelector<HTMLButtonElement>('[data-probe="recognition"]')!.onclick = () => {
    if (!section.querySelector<HTMLInputElement>('[data-probe-consent]')!.checked) { recognitionOutput.value = '保護者確認をチェックしてから診断してください。'; return; }
    if (!prepare()) return;
    const current = generation; let failed = false;
    recognitionOutput.value = '音声認識の開始を要求しています。「こんにちは」と話してください。';
    recognitionTimer = setTimeout(() => { if (current === generation) { cancel(); recognitionOutput.value = '認識結果を確認できませんでした。自動再試行はしません。'; } }, 10000);
    const started = recognizer.start({
      onStart: () => { if (current === generation) recognitionOutput.value = '認識開始イベントを確認しました。「こんにちは」と話してください。'; },
      onError: code => {
        if (current !== generation) return;
        failed = true; clearTimeout(recognitionTimer);
        recognitionOutput.value = `${code}：${recognitionServiceGuidance(code) ?? '認識を完了できませんでした。ブラウザーの権限・接続を確認してください。'}`;
        recognizer.abort();
      },
      onEnd: text => {
        if (current !== generation || failed) return;
        clearTimeout(recognitionTimer);
        recognitionOutput.value = text ? `認識結果を確認しました（${text.length}文字）。発話本文は表示・保存しません。` : '認識は終了しましたが、発話は確定しませんでした。';
      },
    });
    if (started === 'unsupported') { clearTimeout(recognitionTimer); recognitionOutput.value = 'このブラウザーに音声認識APIがありません。'; }
  };
  for (const [probe, id] of [['prepare', 'tohoku-init'], ['output', 'tohoku-conversation-enable']] as const) {
    section.querySelector<HTMLButtonElement>(`[data-probe="${probe}"]`)!.onclick = () => {
      if (!prepare()) return;
      const button = document.querySelector<HTMLButtonElement>('#' + id);
      if (!button || button.disabled) { audioOutput.value = '先にTOHOKU準備を完了してください。'; return; }
      button.click(); // Preserve this explicit user gesture for audio unlocking.
    };
  }
  const voiceStatus = document.querySelector<HTMLOutputElement>('#tohoku-conversation-status');
  const syncVoice = () => { audioOutput.value = voiceStatus?.value ?? '音声状態を取得できません。'; };
  syncVoice();
  if (voiceStatus) new MutationObserver(syncVoice).observe(voiceStatus, { childList: true, characterData: true, subtree: true });
  section.querySelector<HTMLButtonElement>('[data-probe="cancel"]')!.onclick = () => { cancel(); micOutput.value = '診断を停止しました。'; };
  section.querySelector<HTMLInputElement>('[data-probe-consent]')!.onchange = () => { cancel(); };
  document.addEventListener('click', event => {
    const id = (event.target as Element | null)?.closest('button')?.id;
    if (id && ['recognition-start', 'recognition-stop', 'phone-voice', 'tohoku-init', 'tohoku-conversation-enable', 'speech-stop', 'robot-connect', 'robot-arm'].includes(id)) cancel();
  }, true);
  window.addEventListener('colon-recognition-error', event => {
    const code = (event as CustomEvent<{ code: string }>).detail?.code;
    if (code) recognitionOutput.value = `${code}：${recognitionServiceGuidance(code) ?? '音声認識に失敗しました。'}`;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  window.addEventListener('pagehide', cancel);
}
