import './style.css';
import { MotorTestController } from './controller.ts';
import { HttpMotorTransport, MockMotorTransport } from './transport.ts';
import { INITIAL_POWER_NOTES, MotorDiagnostics, validatePowerNotes, type PowerNotes } from './diagnostics.ts';
import { DEFAULT_MOTOR_SETTINGS, validateSettings, type MotorSettings, type SafetyChecks } from './protocol.ts';

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const input = (id: string) => element<HTMLInputElement>(id);
const select = (id: string) => element<HTMLSelectElement>(id);
const button = (id: string) => element<HTMLButtonElement>(id);
const diagnostics = new MotorDiagnostics();
let notes: PowerNotes = { ...INITIAL_POWER_NOTES };
let controller: MotorTestController | null = null;
let uiError = '';
let heldPointer: number | null = null;
const devicePage = location.protocol === 'http:' && location.hostname === '192.168.4.1' && !location.port;
select('mode').options[1]!.disabled = !devicePage;

function checks(): SafetyChecks {
  return { wiring: input('check-wiring').checked, physicalSwitch: input('check-switch').checked,
    raised: input('check-raised').checked, vmOff: input('check-off').checked,
    voltageMeasured: input('check-voltage').checked, currentReviewed: input('check-current').checked };
}
function settings(): MotorSettings {
  const value = { leftPercent: Number(input('left-speed').value), rightPercent: Number(input('right-speed').value),
    invertLeft: input('invert-left').checked, invertRight: input('invert-right').checked,
    pwmHz: Number(input('pwm').value), softStartMs: Number(input('ramp').value), pulseMs: Number(input('pulse').value) };
  validateSettings(value); return value;
}
function readPower(): PowerNotes {
  const numberOrNull = (id: string) => input(id).value.trim() === '' ? null : Number(input(id).value);
  const value: PowerNotes = { settingV: Number(input('setting-v').value), measuredV: numberOrNull('measured-v'),
    displayOffSeconds: numberOrNull('display-seconds'), outputAfterDisplayOff: select('output-state').value as PowerNotes['outputAfterDisplayOff'],
    drivingPower: input('driving-power').value || '未確認', heat: select('heat').value as PowerNotes['heat'],
    measuredAt: input('measured-at').value ? new Date(input('measured-at').value).toISOString() : '' };
  validatePowerNotes(value); return value;
}
function log(operation: string, result: string, error = ''): void {
  const s = controller?.status;
  diagnostics.add({ at: new Date().toISOString(), source: operation === 'power-note' || operation === 'heat-stop' ? 'manual' : s?.source ?? 'mock',
    phase: Number(select('phase').value), connection: controller?.connected ?? false, uptimeMs: s?.uptimeMs ?? null,
    resetReason: s?.resetReason ?? '未取得', operation, left: s?.left ?? 0, right: s?.right ?? 0,
    pwmHz: s?.settings.pwmHz ?? 1000, settings: s?.settings ?? DEFAULT_MOTOR_SETTINGS, stopReason: s?.stopReason ?? '未取得', power: notes, result, error });
  render();
}
function render(): void {
  const c = controller, s = c?.status;
  const real = select('mode').value === 'device';
  element('mode-banner').textContent = real ? '実機接続モード：初期ファームウェアは駆動禁止' : 'モック専用・実機は動きません';
  const rows: Array<[string, string]> = [
    ['接続', c?.connected ? real ? 'AtomS3 接続中' : 'モック 接続中' : '未接続／切断'],
    ['接続方式', real ? '本体Wi-Fi / 同一オリジンHTTP' : '端末内シミュレーション'],
    ['ファームウェア', s?.firmware ?? '未取得'], ['稼働時間（最終受信）', s ? (s.uptimeMs / 1000).toFixed(1) + ' 秒' : '未取得'],
    ['起動回数', s ? s.bootCount > 0 ? String(s.bootCount) : '未取得' : '未取得'], ['再起動理由', s?.resetReason ?? '未取得'],
    ['最終ハートビート（本体）', s ? String(s.lastHeartbeatMs) + ' ms' : '未取得'], ['最終受信日時', c?.lastReceivedAt || '未取得'],
    ['操作許可（ブラウザー）', c?.permitted ? '許可中' : '禁止'], ['GPIO初期化', s?.gpioReady ? '完了（応答値）' : '未確認'],
    ['実機PWM出力ビルド', s?.outputsEnabled ? '有効' : '無効'], ['駆動電源の適合確認', s?.powerQualified ? 'ビルド設定で確認済み' : '未確認・実機駆動禁止'],
    ['左右のPWM（最終受信）', s ? `左 ${s.left}% / 右 ${s.right}%${real ? '（電流・回転は未測定）' : '（仮想）'}` : '未取得'],
    ['停止理由（最終受信）', s?.stopReason ?? '未取得'],
  ];
  const fragment = document.createDocumentFragment();
  for (const [key, value] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; fragment.append(dt, dd); }
  element('telemetry').replaceChildren(fragment);
  element('error').textContent = uiError || c?.error || '';
  button('connect').disabled = Boolean(c?.connected || c?.busy);
  button('disconnect').disabled = !c?.connected && !c?.busy;
  select('mode').disabled = Boolean(c?.connected || c?.busy);
  const stage = Number(select('phase').value), confirmation = checks();
  const confirmed = confirmation.wiring && confirmation.physicalSwitch && confirmation.raised
    && (stage <= 4 ? confirmation.vmOff : confirmation.voltageMeasured && confirmation.currentReviewed);
  const firmwarePermits = !real || Boolean(s?.outputsEnabled && (stage === 3 || stage === 4 || s.powerQualified && stage >= 5));
  button('arm').disabled = !c?.connected || c.busy || c.permitted || !confirmed || !firmwarePermits || Boolean(s?.estop);
  button('reset').disabled = !c?.connected || c.busy || !s?.estop;
  for (const target of document.querySelectorAll<HTMLButtonElement>('[data-drive]')) target.disabled = !c?.connected || !c.permitted || Boolean(c.busy && !c.pressed);
  for (const id of ['left-speed', 'right-speed', 'both-speed', 'pwm', 'ramp', 'pulse', 'invert-left', 'invert-right']) input(id).disabled = Boolean(c?.permitted || c?.busy);
  button('apply-settings').disabled = !c?.connected || c.busy || c.permitted;
  element('stop-status').textContent = !c?.connected ? '実機状態は未確認・再接続しても自動再始動しません'
    : c.permitted ? `指を離すと停止。パルス上限 ${s?.settings.pulseMs ?? 100}ms。` : '操作許可なし／実機出力状態は上の最終応答を確認';
  element('log').textContent = diagnostics.entries.slice(-12).map(e => `${e.at} [${e.source}] Phase${e.phase} ${e.operation}: ${e.result}${e.error ? ' / ' + e.error : ''}`).join('\n');
}
function report(error: unknown): void { uiError = error instanceof Error ? error.message : '入力を確認してください'; render(); }
function download(kind: 'json' | 'csv'): void {
  const content = kind === 'json' ? diagnostics.json() : diagnostics.csv();
  const url = URL.createObjectURL(new Blob([content], { type: kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `colon-motor-${new Date().toISOString().replace(/[:.]/g, '-')}.${kind}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
button('connect').addEventListener('click', () => {
  uiError = '';
  try {
    const transport = select('mode').value === 'device' ? new HttpMotorTransport(location.origin) : new MockMotorTransport();
    controller = new MotorTestController(transport, render, log); void controller.connect();
  } catch (error) { report(error); }
});
button('disconnect').addEventListener('click', () => controller?.disconnect());
select('mode').addEventListener('change', () => { controller?.disconnect(); controller = null; select('phase').value = select('mode').value === 'device' ? '3' : '2'; render(); });
select('phase').addEventListener('change', () => { void controller?.stop(); render(); });
for (const item of document.querySelectorAll<HTMLInputElement>('.checks input')) item.addEventListener('change', () => { if (controller?.permitted) void controller.stop(); render(); });
for (const id of ['left-speed', 'right-speed']) input(id).addEventListener('input', () => { element(id === 'left-speed' ? 'left-label' : 'right-label').textContent = input(id).value + '%'; });
input('both-speed').addEventListener('input', () => { for (const side of ['left', 'right']) { input(side + '-speed').value = input('both-speed').value; element(side + '-label').textContent = input('both-speed').value + '%'; } });
button('apply-settings').addEventListener('click', () => { try { uiError = ''; void controller?.configure(settings()); } catch (error) { report(error); } });
button('arm').addEventListener('click', () => { void (async () => {
  try { uiError = ''; notes = readPower();
    if (notes.heat === 'present') { await controller?.stop(true); throw new Error('発熱あり：試験を中止してください'); }
    if (Number(select('phase').value) >= 5 && notes.measuredV !== null && notes.measuredV > 1.5) throw new Error('VM実測が1.5Vを超えています：駆動を許可できません');
    await controller?.configure(settings());
    await controller?.arm(Number(select('phase').value), checks(), notes.measuredV === null ? undefined : Math.round(notes.measuredV * 1000));
  } catch (error) { report(error); }
})(); });
button('reset').addEventListener('click', () => { void controller?.reset(); });
for (const id of ['stop', 'dpad-stop']) button(id).addEventListener('click', () => { void controller?.stop(); });
button('emergency-stop').addEventListener('click', () => { void controller?.stop(true); });
for (const target of document.querySelectorAll<HTMLButtonElement>('[data-drive]')) {
  const directions = target.dataset.drive!.split(',').map(Number);
  target.addEventListener('pointerdown', event => {
    if (target.disabled || heldPointer !== null || controller?.pressed || controller?.busy) return;
    event.preventDefault(); heldPointer = event.pointerId;
    try { target.setPointerCapture(event.pointerId); } catch { /* Global release is also observed. */ }
    void controller?.drive(directions[0]!, directions[1]!);
  });
  target.addEventListener('lostpointercapture', () => { if (heldPointer !== null) { heldPointer = null; void controller?.stop(); } });
  target.addEventListener('keydown', event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); void controller?.drive(directions[0]!, directions[1]!); } });
  target.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); void controller?.stop(); } });
  target.addEventListener('contextmenu', event => event.preventDefault());
}
for (const type of ['pointerup', 'pointercancel'] as const) document.addEventListener(type, event => {
  if (heldPointer === event.pointerId) { heldPointer = null; void controller?.stop(); }
}, true);
window.addEventListener('blur', () => { heldPointer = null; void controller?.stop(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') void controller?.stop(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { heldPointer = null; controller?.disconnect(); } });
window.addEventListener('pagehide', () => controller?.disconnect());
button('save-power').addEventListener('click', () => { try { uiError = ''; notes = readPower(); if (notes.heat === 'present') void controller?.stop(true); log('power-note', 'ユーザー入力として記録（自動測定ではない）'); } catch (error) { report(error); } });
select('heat').addEventListener('change', () => { if (select('heat').value === 'present') { void controller?.stop(true); notes = { ...notes, heat: 'present' }; log('heat-stop', '発熱報告により停止要求'); } });
button('export-json').addEventListener('click', () => download('json'));
button('export-csv').addEventListener('click', () => download('csv'));
render();
