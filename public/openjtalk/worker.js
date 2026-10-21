import createOpenJTalk from './open_jtalk.mjs';

const DICTIONARY_URL = './open_jtalk_dic_utf_8-1.11.bin';
const MODEL_URL = './tohoku-f01-happy.htsvoice';
const DICTIONARY_ROOT = '/openjtalk/dic';
const MODEL_PATH = '/openjtalk/tohoku-f01-happy.htsvoice';
const WAVE_PATH = '/openjtalk/output.wav';

let moduleInstance;
let ready = false;
let busy = false;
let cancelled = false;

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (message?.type === 'init') void initialize();
  if (message?.type === 'synthesize') void synthesize(message.text, message.requestId, message.purpose);
});

function send(type, detail = {}, transfer = []) {
  self.postMessage({ type, ...detail }, transfer);
}

async function initialize() {
  if (ready || busy) return;
  busy = true;
  cancelled = false;
  const startedAt = performance.now();
  try {
    send('status', { message: 'WASMを初期化しています…' });
    moduleInstance = await createOpenJTalk({
      locateFile: (path) => new URL(path, self.location.href).href,
      print: () => {},
      printErr: (message) => send('warning', { message: String(message).slice(0, 180) }),
    });
    if (cancelled) throw new Error('ユーザーが初期化をキャンセルしました。');
    moduleInstance.FS.mkdir('/openjtalk');
    moduleInstance.FS.mkdir(DICTIONARY_ROOT);
    await downloadAndExtractDictionary();
    await downloadModel();
    send('status', { message: '東北Happy音声モデルを読み込んでいます…' });
    const loaded = moduleInstance.ccall('oj_init', 'number', ['string', 'string'], [DICTIONARY_ROOT, MODEL_PATH]);
    if (loaded !== 1) throw new Error('Open JTalkが辞書または音声モデルを読み込めませんでした。');
    ready = true;
    send('ready', { initializationMs: performance.now() - startedAt });
  } catch (error) {
    ready = false;
    send('error', { stage: 'initialize', message: safeMessage(error) });
  } finally {
    busy = false;
  }
}

async function downloadAndExtractDictionary() {
  if (typeof DecompressionStream === 'undefined') throw new Error('このSafariではgzip展開APIが利用できません。');
  const response = await fetch(new URL(DICTIONARY_URL, self.location.href));
  if (!response.ok || !response.body) throw new Error(`辞書の取得に失敗しました（HTTP ${response.status}）。`);
  const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
  const reader = decompressed.getReader();
  let active = new Uint8Array(0);
  let cursor = 0;
  let received = 0;
  let entries = 0;

  async function readExact(length) {
    const result = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (cursor >= active.length) {
        const next = await reader.read();
        if (next.done) throw new Error('辞書アーカイブが途中で終わりました。');
        active = next.value;
        cursor = 0;
      }
      const amount = Math.min(length - written, active.length - cursor);
      result.set(active.subarray(cursor, cursor + amount), written);
      cursor += amount;
      written += amount;
    }
    return result;
  }

  async function writeExactFile(path, length) {
    const stream = moduleInstance.FS.open(path, 'w');
    try {
      let remaining = length;
      while (remaining > 0) {
        if (cancelled) throw new Error('ユーザーが初期化をキャンセルしました。');
        if (cursor >= active.length) {
          const next = await reader.read();
          if (next.done) throw new Error('辞書アーカイブが途中で終わりました。');
          active = next.value;
          cursor = 0;
          received += active.length;
          send('progress', { phase: 'dictionary', loaded: received });
        }
        const amount = Math.min(remaining, active.length - cursor);
        moduleInstance.FS.write(stream, active, cursor, amount);
        cursor += amount;
        remaining -= amount;
      }
    } finally {
      moduleInstance.FS.close(stream);
    }
  }

  async function skip(length) {
    let remaining = length;
    while (remaining > 0) {
      if (cursor >= active.length) {
        const next = await reader.read();
        if (next.done) throw new Error('辞書アーカイブが途中で終わりました。');
        active = next.value;
        cursor = 0;
        received += active.length;
        send('progress', { phase: 'dictionary', loaded: received });
      }
      const amount = Math.min(remaining, active.length - cursor);
      cursor += amount;
      remaining -= amount;
    }
  }

  try {
    for (;;) {
      const header = await readExact(512);
      if (header.every((byte) => byte === 0)) break;
      const decoder = new TextDecoder();
      const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, '');
      const prefix = decoder.decode(header.subarray(345, 500)).replace(/\0.*$/, '');
      const relativePath = `${prefix ? `${prefix}/` : ''}${name}`.replace(/^open_jtalk_dic_utf_8-1\.11\//, '');
      const sizeText = decoder.decode(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
      const size = Number.parseInt(sizeText || '0', 8);
      if (!Number.isFinite(size) || size < 0) throw new Error('辞書アーカイブの形式が不正です。');
      if (relativePath && !relativePath.endsWith('/') && /^[a-zA-Z0-9._-]+$/.test(relativePath)) {
        await writeExactFile(`${DICTIONARY_ROOT}/${relativePath}`, size);
        entries += 1;
      } else {
        await skip(size);
      }
      await skip((512 - (size % 512)) % 512);
    }
  } finally {
    reader.releaseLock();
  }
  if (entries < 8 || !moduleInstance.FS.analyzePath(`${DICTIONARY_ROOT}/sys.dic`).exists) {
    throw new Error('辞書ファイルが不足しています。');
  }
}

async function downloadModel() {
  const response = await fetch(new URL(MODEL_URL, self.location.href));
  if (!response.ok) throw new Error(`音声モデルの取得に失敗しました（HTTP ${response.status}）。`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (cancelled) throw new Error('ユーザーが初期化をキャンセルしました。');
  moduleInstance.FS.writeFile(MODEL_PATH, bytes);
}

async function synthesize(text, requestId, purpose) {
  if (!ready || busy) {
    send('error', { stage: 'synthesize', requestId, message: ready ? '別の音声を生成中です。' : '先にエンジンを初期化してください。' });
    return;
  }
  busy = true;
  try {
    if (typeof text !== 'string' || !text.trim() || text.length > 180) throw new Error('日本語の文章を1〜180文字で入力してください。');
    if (moduleInstance.FS.analyzePath(WAVE_PATH).exists) moduleInstance.FS.unlink(WAVE_PATH);
    const startedAt = performance.now();
    const result = moduleInstance.ccall('oj_synthesize', 'number', ['string', 'string'], [text.trim(), WAVE_PATH]);
    const generationMs = performance.now() - startedAt;
    if (result !== 1) throw new Error('音声を生成できませんでした。入力文を短くして再試行してください。');
    const wav = moduleInstance.FS.readFile(WAVE_PATH);
    const transferable = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
    send('generated', { requestId, purpose, generationMs, byteLength: wav.byteLength, wav: transferable }, [transferable]);
  } catch (error) {
    send('error', { stage: 'synthesize', requestId, purpose, message: safeMessage(error) });
  } finally {
    busy = false;
  }
}

function safeMessage(error) {
  return error instanceof Error ? error.message.slice(0, 240) : 'Open JTalk処理に失敗しました。';
}
