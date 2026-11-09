import { MotorTestController } from '../motor/controller.ts';
import { MockMotorTransport } from '../motor/transport.ts';
import { DEFAULT_MOTOR_SETTINGS } from '../motor/protocol.ts';
import type { ConversationResult } from '../conversation/conversation-engine.ts';
import { ColonBridge, BridgeMotorTransport } from './bridge.ts';
import { ReplyMotionGate } from './reply-motion.ts';
import { DirectAtomTransport } from './direct-atom.ts';
import { ColonBleController, bleBrowserSupport } from './ble-controller.ts';
import { saveOfflineScreen } from './offline-save.ts';
import './robot.css';

export function mountRobotIntegration() {
  let bridge = new ColonBridge(); const gate = new ReplyMotionGate();
  const root = document.createElement('aside'); root.id = 'robot-panel'; root.hidden = true;
  root.setAttribute('aria-label', 'Colon連携・ラジコン');
  root.innerHTML = `<header><strong>Colon BLE連携 v34</strong><button id="robot-close">顔を見る</button></header>
  <p>会話・ATOM表示・短時間ラジコン</p>
  <label>動作先 <select id="robot-target"><option value="mock">モック（実機は動きません）</option><option value="ble">スマホ → BLE → AtomS3（既存1.8.0）</option><option value="phone">旧方式：直接Wi-Fi</option><option value="device">旧方式：PC中継</option></select></label>
  <section id="ble-connection"><output id="ble-support"></output><p>初回USB書き込み後はBLEで接続。Atom接続用のWi-Fi設定や証明書は使用しません。</p>
  <a href="https://apps.apple.com/app/id1492822055" target="_blank" rel="noopener">iPhone用Bluefyの案内</a>
  <p><strong>既存BLE版は出力100%・1000Hz固定です。時間で動きを調整します。</strong></p>
  <label><input id="ble-power-reviewed" type="checkbox"> この機体の電源・100%出力条件を確認した</label>
  <button id="ble-offline-save">画面をオフライン用に保存</button><output id="ble-offline-status">音声モデルは別途準備。音声認識の完全オフライン動作は未確認です。</output>
  <details><summary>文字で会話して連動を確認</summary><input id="robot-text" maxlength="120" aria-label="話しかける文"><button id="robot-say">送信して返事</button><output id="robot-reply"></output></details></section>
  <section id="phone-connection"><label>AtomS3のアドレス <input id="phone-address" type="url" value="https://colon-atom.local" autocapitalize="off" spellcheck="false"></label>
  <label>AtomS3接続コード <input id="phone-code" type="password" autocomplete="off"></label>
  <p>同じ家庭内Wi-Fiに接続してください。初回はiPhoneで証明書の設定が必要です。</p>
  <a href="https://colon-atom.local/" target="_blank" rel="noopener">AtomS3のHTTPS接続を確認</a>
  <label><input id="phone-face" type="checkbox"> 返答後にATOMにも表情を表示</label></section>
  <label>PC接続コード <input id="robot-code" type="password" autocomplete="off"></label>
  <button id="robot-connect">動作先に接続</button>
  <label>モード <select id="robot-mode"><option value="off">動作OFF</option><option value="reply">返答と連動</option><option value="rc">ラジコン</option></select></label>
  <label>速度 <input id="robot-speed" type="range" min="0" max="30" value="15"> <output id="robot-speed-value">15%</output></label>
  <details><summary>左右の向きを調整</summary><label><input id="robot-invert-left" type="checkbox"> 左モーターの向きを反転</label><label><input id="robot-invert-right" type="checkbox"> 右モーターの向きを反転</label><p>変更は次の駆動許可時に適用します。</p></details>
  <label>1回の上限 <select id="robot-pulse"><option value="100">100ms</option><option value="300">300ms</option><option value="500">500ms</option></select></label>
  <fieldset id="robot-checks"><legend>実機の駆動前確認（モックでは不要）</legend>
  <label><input type="checkbox" id="robot-wiring"> 配線・MODE・共通GNDを確認</label>
  <label><input type="checkbox" id="robot-switch"> 物理電源遮断スイッチを確認</label>
  <label><input type="checkbox" id="robot-raised"> キャタピラを床から離した</label>
  <label><input type="checkbox" id="robot-current"> 定格・始動電流と電源を確認</label>
  <label id="robot-voltage-label">実測VM（Wi-Fi診断版：1.5V以下）<input id="robot-voltage" type="number" min="0.001" max="1.5" step="0.001"></label></fieldset>
  <button id="robot-arm" disabled>次の1回を許可</button><button id="robot-reset" disabled>非常停止を解除</button>
  <div class="robot-pad" aria-label="押している間だけ・1回上限あり">
  <button data-drive="1,1" class="up">前進 ↑</button><button data-drive="-1,1">左 ←</button><button id="robot-stop">停止</button><button data-drive="1,-1">右 →</button><button data-drive="-1,-1" class="down">後退 ↓</button></div>
  <output id="robot-status" role="status">未接続・駆動許可なし</output>
  <details id="notif-options"><summary>AtomS3の文字・画像表示（Notif）</summary><p>PCのBluetoothを使用。Motor Testとは別ファームウェアです。同じ1台での併用はできません。</p>
  <button id="atom-connect">PC表示サーバーを起動・接続</button><select id="atom-device" aria-label="表示先"><option value="">未接続</option></select>
  <label><input id="atom-auto" type="checkbox"> 返答文を選んだATOMへ送る（会話文がPCを経由します）</label>
  <a href="/atom/" target="_blank" rel="noopener">文字・画像の編集画面</a><output id="atom-status" role="status"></output></details>`;
  const launcher = document.createElement('button'); launcher.id = 'robot-launcher'; launcher.textContent = '接続・操作';
  const emergency = document.createElement('button'); emergency.id = 'robot-emergency'; emergency.textContent = '非常停止'; emergency.hidden = true;
  document.body.append(root, launcher, emergency);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const value = (id: string) => el<HTMLInputElement>(id).value;
  const checked = (id: string) => el<HTMLInputElement>(id).checked;
  let source = 'mock', paired = false, displayBusy = false, connecting = false, operation = 0, lastMotion = '待機';
  let direct: DirectAtomTransport | null = null, replyEmotion = 'NORMAL', replyTurn = 0;
  const phoneLaunch = location.pathname.endsWith('/phone.html') || new URLSearchParams(location.search).get('phone') === '1';
  if (phoneLaunch) el<HTMLSelectElement>('robot-target').value = 'ble';
  const browser = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const bluetooth = navigator as Navigator & { bluetooth?: { requestDevice?: unknown } };
  const support = bleBrowserSupport({ secure: window.isSecureContext, bluetooth: typeof bluetooth.bluetooth?.requestDevice === 'function', recognition: Boolean(browser.SpeechRecognition ?? browser.webkitSpeechRecognition) });
  el('ble-support').textContent = support.message;
  function targetChanged() {
    const phone = value('robot-target') === 'phone', ble = value('robot-target') === 'ble';
    el('ble-connection').hidden = !ble;
    el('phone-connection').hidden = !phone;
    el('notif-options').hidden = phone || ble;
    el<HTMLInputElement>('robot-code').parentElement!.hidden = phone || ble;
    el('robot-voltage-label').hidden = ble;
    const slider = el<HTMLInputElement>('robot-speed'); slider.max = ble ? '100' : '30'; slider.value = ble ? '100' : '15';
    el('robot-speed-value').textContent = ble ? '100%固定' : '15%';
  }
  targetChanged();
  const driveButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-drive]')];
  function render() {
    const s = controller.status;
    el('robot-status').textContent = `${source === 'mock' ? 'モック' : '実機'} / ${controller.connected ? '接続' : '未接続'} / ${s?.estop ? '非常停止中' : controller.permitted ? '次の1回を許可中' : '駆動許可なし'} / ${lastMotion}${controller.error ? ' / ' + controller.error : ''}`;
    const supported = source === 'mock' || (source === 'ble' ? s?.firmware === 'colon-motor-1.8.0' && s.gpioReady : Boolean(s?.outputsEnabled && s.powerQualified));
    el<HTMLButtonElement>('robot-arm').disabled = !controller.connected || controller.busy || controller.permitted || !!s?.estop || gate.mode === 'off' || !supported;
    el<HTMLButtonElement>('robot-reset').disabled = !controller.connected || !s?.estop || controller.busy;
    el<HTMLButtonElement>('robot-connect').disabled = controller.busy || connecting || (value('robot-target') === 'ble' && !support.available);
    for (const id of ['robot-target', 'robot-speed', 'robot-pulse', 'phone-address', 'phone-code', 'robot-invert-left', 'robot-invert-right']) el<HTMLInputElement>(id).disabled = controller.permitted || controller.busy || connecting;
    if (value('robot-target') === 'ble') el<HTMLInputElement>('robot-speed').disabled = true;
    driveButtons.forEach(b => b.disabled = gate.mode !== 'rc' || !controller.permitted || controller.busy);
    emergency.hidden = !controller.connected;
  }
  let controller: MotorTestController | ColonBleController = new MotorTestController(new MockMotorTransport(), render);
  const stop = () => { operation++; gate.cancel(); void controller.stop(); };
  el('robot-target').onchange = () => {
    stop(); controller.disconnect(); direct = null; source = value('robot-target');
    lastMotion = '動作先を変更・再接続してください'; targetChanged(); render();
  };
  const closePanel = () => {
    root.hidden = true; document.body.classList.remove('robot-panel-open');
    // Keep a settled one-shot permission for voice replies while showing the full face.
    if (controller.busy || controller.pressed || controller.status?.active) stop();
  };
  launcher.onclick = () => {
    root.hidden = !root.hidden; document.body.classList.toggle('robot-panel-open', !root.hidden);
    if (!root.hidden) { document.querySelector('#debug')?.classList.add('debug--minimized'); document.body.classList.remove('debug-expanded'); }
    else closePanel();
  };
  el('robot-close').onclick = closePanel;
  emergency.onclick = () => { gate.mode = 'off'; el<HTMLSelectElement>('robot-mode').value = 'off'; gate.cancel(); void controller.stop(true); };
  el('robot-stop').onclick = stop;
  el('robot-reset').onclick = () => { void controller.reset(); };
  el('robot-mode').onchange = () => { stop(); gate.mode = value('robot-mode') as typeof gate.mode; render(); };
  el('robot-speed').oninput = () => { el('robot-speed-value').textContent = value('robot-speed') + '%'; };
  el('robot-connect').onclick = async () => {
    if (connecting) return;
    const generation = ++operation; connecting = true;
    controller.disconnect(); direct = null; source = value('robot-target'); paired = false; bridge = new ColonBridge(); render();
    try {
      if (source === 'ble' && !support.available) throw new Error(support.message);
      if (source === 'phone') {
        if (!window.isSecureContext) throw new Error('iPhoneの会話画面はHTTPSで開いてください。');
        direct = new DirectAtomTransport(value('phone-address'), value('phone-code'));
      }
      if (source === 'device') { await bridge.pair(value('robot-code')); paired = true; }
      if (generation !== operation || document.hidden) return;
      controller = source === 'ble' ? new ColonBleController(render) : new MotorTestController(source === 'mock' ? new MockMotorTransport() : direct ?? new BridgeMotorTransport(bridge), render);
      await controller.connect();
      if (controller.connected && source !== 'mock' && controller.status && !controller.status.outputsEnabled) lastMotion = '診断専用FW・実機駆動は無効';
      else if (source === 'ble' && controller.connected) lastMotion = 'BLE 1.8.0・100%固定・停止中';
      render();
    } catch (e) { lastMotion = String(e); } finally { connecting = false; render(); }
  };
  el('robot-arm').onclick = async () => {
    const generation = ++operation;
    const mock = source === 'mock', ble = source === 'ble'; const measuredMv = Number(value('robot-voltage')) * 1000;
    if (!mock && (!checked('robot-wiring') || !checked('robot-switch') || !checked('robot-raised') || !checked('robot-current') || (ble ? !checked('ble-power-reviewed') : !Number.isInteger(measuredMv) || measuredMv <= 0 || measuredMv > 1500))) {
      lastMotion = '実機確認と実測電圧が必要です'; render(); return;
    }
    try {
      await controller.configure({ ...DEFAULT_MOTOR_SETTINGS, leftPercent: Number(value('robot-speed')), rightPercent: Number(value('robot-speed')), pulseMs: Number(value('robot-pulse')), invertLeft: checked('robot-invert-left'), invertRight: checked('robot-invert-right') });
      if (gate.mode === 'off' || controller.error || generation !== operation || document.hidden) return;
      await controller.arm(mock ? 3 : 6, { wiring: mock || checked('robot-wiring'), physicalSwitch: mock || checked('robot-switch'), raised: mock || checked('robot-raised'), vmOff: mock, voltageMeasured: !mock && !ble, currentReviewed: !mock, legacyBlePowerReviewed: ble && checked('ble-power-reviewed') }, mock || ble ? undefined : measuredMv);
    } catch (e) { lastMotion = String(e); render(); }
  };
  let activePointer: number | null = null;
  for (const button of driveButtons) {
    button.onpointerdown = e => {
      if (e.button !== 0 || activePointer !== null || gate.mode !== 'rc' || !controller.permitted) return;
      e.preventDefault(); activePointer = e.pointerId; button.setPointerCapture(e.pointerId);
      const [left, right] = button.dataset.drive!.split(',').map(Number); lastMotion = button.textContent!; void controller.drive(left!, right!);
    };
    button.onkeydown = e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && controller.permitted && gate.mode === 'rc') { e.preventDefault(); const [l, r] = button.dataset.drive!.split(',').map(Number); void controller.drive(l!, r!); } };
    button.onkeyup = e => { if (e.key === ' ' || e.key === 'Enter') stop(); };
  }
  const release = (e: PointerEvent) => { if (activePointer === e.pointerId) { activePointer = null; stop(); } };
  window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
  root.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => { if (!connecting) stop(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') emergency.click(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); controller.disconnect(); } });
  window.addEventListener('pagehide', () => { stop(); controller.disconnect(); });
  el('ble-offline-save').onclick = async () => {
    const button = el<HTMLButtonElement>('ble-offline-save'); button.disabled = true;
    try { operation++; gate.cancel(); await controller.stop(); const count = await saveOfflineScreen(); el('ble-offline-status').textContent = `画面・顔データ${count}件を保存しました。このブラウザーでネットを切って再起動を確認してください。音声モデルと音声認識は別途確認が必要です。`; }
    catch (e) { el('ble-offline-status').textContent = String(e); } finally { button.disabled = false; }
  };
  el('robot-say').onclick = () => {
    const input = document.querySelector<HTMLInputElement>('#conversation-input'), send = document.querySelector<HTMLButtonElement>('#conversation-send');
    if (input && send && value('robot-text').trim()) { input.value = value('robot-text').trim(); el<HTMLInputElement>('robot-text').value = ''; send.click(); }
  };
  const replyOutput = document.querySelector<HTMLOutputElement>('#conversation-reply');
  if (replyOutput) new MutationObserver(() => { el('robot-reply').textContent = replyOutput.value; }).observe(replyOutput, { childList: true, characterData: true, subtree: true });
  el('atom-connect').onclick = async () => {
    try {
      if (!paired) { await bridge.pair(value('robot-code')); paired = true; }
      await bridge.request('atom/start');
      const status = await bridge.request('atom/status') as { devices?: { number: number; name: string }[] };
      const select = el<HTMLSelectElement>('atom-device'); select.replaceChildren(new Option('送信先を選択', ''));
      for (const device of status.devices ?? []) select.add(new Option(device.name, String(device.number)));
      el('atom-status').textContent = status.devices?.length ? '表示先を選択してください' : '機器を検索中。少し待って再度接続してください';
    } catch (e) { el('atom-status').textContent = String(e); }
  };
  async function displayReply(text: string) {
    if (!checked('atom-auto') || !value('atom-device') || displayBusy) return;
    displayBusy = true;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff4e1'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#2c1a12'; ctx.font = '12px sans-serif';
      const chars = [...text]; for (let line = 0; line < 8; line++) ctx.fillText(chars.slice(line * 9, (line + 1) * 9).join(''), 6, 15 + line * 14);
      if (chars.length > 72) ctx.fillText('…', 112, 125);
      await bridge.request('atom/display', { device: value('atom-device'), png: canvas.toDataURL('image/png').split(',')[1] });
      el('atom-status').textContent = '表示を送信しました（長文は省略）';
    } catch (e) { el('atom-status').textContent = String(e); } finally { displayBusy = false; }
  }
  render();
  return {
    prepare(turn: number, result: ConversationResult, emotion: string) { gate.prepare(turn, result, emotion); replyEmotion = emotion; replyTurn = turn; },
    started(turn: number, text: string) {
      const plan = gate.start(turn);
      if (plan && controller.permitted && !document.hidden) { lastMotion = plan.label; void controller.drive(plan.left, plan.right); }
      void displayReply(text);
    },
    finished(turn: number) {
      if (turn !== replyTurn) return;
      if (gate.mode === 'reply') stop();
      // Display only after stopping. An image/UI update never grants motor permission.
      const transport = direct, emotion = replyEmotion, current = controller;
      if (source === 'phone' && checked('phone-face') && transport && current.connected && gate.mode !== 'rc') {
        void current.stop().then(async () => { if (current === controller && !current.permitted && !document.hidden) await transport.display(emotion); }).catch(e => { lastMotion = String(e); render(); });
      }
    },
    interrupt() { gate.cancel(); if (gate.mode === 'reply' && (controller.pressed || controller.status?.active)) void controller.stop(); },
    safetyStop() { stop(); },
  };
}
