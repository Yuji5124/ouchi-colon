import type { MotorSettings, MotorStatus, SafetyChecks } from '../motor/protocol.ts';
import { DEFAULT_MOTOR_SETTINGS, validateSettings } from '../motor/protocol.ts';
import { BleTransport, type Transport } from './ble-core/transport.ts';
import { MotorSession } from './ble-core/session.ts';
import { MotorCommunications } from './ble-core/communications.ts';
import { OPS, direction, type MotorStatus as BleStatus } from './ble-core/protocol.ts';

export function bleBrowserSupport(environment: { secure: boolean; bluetooth: boolean; recognition: boolean }) {
  return {
    available: environment.secure && environment.bluetooth,
    message: !environment.secure ? 'HTTPSでColonを開いてください。'
      : !environment.bluetooth ? 'このブラウザーはBLE非対応です。iPhoneではBluefy等の対応ブラウザーで開いてください。'
      : !environment.recognition ? 'BLEを利用できます。このブラウザーは音声認識を公開していないため、文字入力で返答連動を確認してください。'
      : 'BLE・音声認識APIを検出しました。音声とBLEの同時動作は実機で確認してください。',
  };
}
export function assertBleProfile(s: BleStatus): void {
  const uint = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (s.firmware !== 'colon-motor-1.8.0' || s.patternsVersion !== 6 || s.protocol !== 1 || !s.gpioReady
    || !uint(s.bootId) || !uint(s.nonce) || s.nonce === 0 || !uint(s.seq) || !uint(s.uptimeMs) || !uint(s.heartbeatAgeMs)
    || ![s.left, s.right, s.physicalLeft, s.physicalRight].every(n => Number.isInteger(n) && [0, -100, 100].includes(n))
    || s.frequency !== 1000 || !Number.isInteger(s.pulseMs) || s.pulseMs < 50 || s.pulseMs > 12000) {
    throw new Error('既存BLE走行ファーム1.8.0の状態を確認できません。自動書き込みは行いません。');
  }
}
export function bleDirections(left: number, right: number): [number, number] {
  if (![-1, 0, 1].includes(left) || ![-1, 0, 1].includes(right) || (!left && !right)) throw new Error('invalid-direction');
  if (left === -1 && right === 1) return direction('left', 100, 100, true);
  if (left === 1 && right === -1) return direction('right', 100, 100, true);
  return [left * 100, right * 100];
}

/** Reuses the deployed 20-byte BLE protocol, nonce handling and heartbeat scheduler. */
export class ColonBleController {
  status: MotorStatus | null = null;
  permitted = false; pressed = 0; error = ''; lastReceivedAt = '';
  private established = false;
  private pending = 0; private stopping = 0; private generation = 0; private bootId: number | null = null;
  private ack = 0; private moving = false;
  private settings: MotorSettings = { ...DEFAULT_MOTOR_SETTINGS, leftPercent: 100, rightPercent: 100 };
  private readonly session: MotorSession;
  private readonly communications: MotorCommunications;
  private timer: ReturnType<typeof setInterval> | null = null;
  private changed: () => void;
  private autoTick: boolean;
  get connected() { return this.established && this.session.connected; }
  get busy() { return this.pending > 0 || this.stopping > 0 || this.session.foregroundBusy; }
  constructor(changed = () => {}, transport: Transport = new BleTransport(), autoTick = true) {
    this.changed = changed; this.autoTick = autoTick; this.session = new MotorSession(transport);
    this.session.onEvent = event => {
      if (event === 'STOP' || event === 'ESTOP') this.ack++;
      if (event === 'disconnect' || event === 'restart-detected' || event === 'stop-unconfirmed') {
        this.permitted = false; this.pressed = 0; this.moving = false; this.established = false; this.generation++;
        if (this.timer) clearInterval(this.timer); this.timer = null;
        if (event !== 'disconnect') this.error = event;
      }
    };
    this.session.onStatus = () => this.observe();
    this.communications = new MotorCommunications({ session: () => this.session,
      enabled: () => this.connected && (typeof document === 'undefined' || !document.hidden),
      error: error => { this.error = String(error); this.permitted = false; this.changed(); } });
  }
  private observe() {
    const s = this.session.status;
    if (!s) { this.status = null; this.changed(); return; }
    try {
      assertBleProfile(s);
      if (this.established && !s.connected) throw new Error('本体のBLE接続状態を確認できません。再接続してください。');
      if (this.bootId !== null && s.bootId !== this.bootId) throw new Error('AtomS3が再起動しました。再接続が必要です。');
      if (s.estop || (this.moving && !s.armed)) { this.permitted = false; this.pressed = 0; this.moving = false; }
      this.status = {
        protocol: 1, source: 'device', firmware: s.firmware, bootId: String(s.bootId), bootCount: s.bootCount ?? 0,
        resetReason: s.resetReason, uptimeMs: s.uptimeMs, lastHeartbeatMs: (s.uptimeMs - s.heartbeatAgeMs) >>> 0,
        connected: s.connected, gpioReady: s.gpioReady, outputsEnabled: true,
        // A working experimental BLE program does not certify the electrical supply.
        powerQualified: s.powerQualified, armed: s.armed, estop: s.estop, active: Boolean(s.left || s.right),
        left: s.left, right: s.right, targetLeft: s.left, targetRight: s.right,
        stopReason: s.stopReason, lastSeq: s.seq, stage: 0, settings: { ...this.settings },
      };
      this.lastReceivedAt = new Date().toISOString();
    } catch (error) {
      this.error = String(error); this.permitted = false; this.pressed = 0; this.established = false;
      if (this.timer) clearInterval(this.timer); this.timer = null;
      this.session.requestStop(); this.session.disconnect();
    }
    this.changed();
  }
  async connect() {
    const generation = ++this.generation; this.pending++; this.error = ''; this.permitted = false; this.changed();
    try {
      await this.session.connect();
      if (generation !== this.generation) { this.session.disconnect(); return; }
      // The firmware publishes its connection snapshot on its own task; allow that
      // read-only snapshot to catch up before claiming that connection is ready.
      for (let retry = 0; this.session.status && !this.session.status.connected && retry < 5; retry++) {
        await new Promise(resolve => setTimeout(resolve, 20)); await this.session.poll();
        if (generation !== this.generation) { this.session.disconnect(); return; }
      }
      const s = this.session.status!; assertBleProfile(s);
      if (!s.connected || s.armed || s.left || s.right) throw new Error('接続時に停止を確認できません。');
      this.bootId = s.bootId; this.established = true;
      if (this.autoTick) this.timer = setInterval(() => { void this.pump(); }, 40);
      this.observe();
    } catch (error) { this.error = String(error); this.disconnect(); }
    finally { this.pending--; this.changed(); }
  }
  async pump() { await this.communications.tick(); }
  async configure(settings: MotorSettings) {
    validateSettings(settings);
    if (this.permitted || this.moving || this.busy || !this.connected) throw new Error('停止してから設定してください。');
    if (settings.leftPercent !== 100 || settings.rightPercent !== 100 || settings.pwmHz !== 1000 || settings.softStartMs !== 100) {
      throw new Error('既存BLE版1.8.0は100%・1000Hz固定です。低出力への置き換えは行いません。');
    }
    this.settings = { ...settings };
    this.session.settings = { frequency: 1000, pulseMs: settings.pulseMs,
      invertLeft: settings.invertLeft, invertRight: settings.invertRight,
      signalOnly: false, rcTest: true, directControl: true, actionStep: true };
    this.observe();
  }
  async arm(_stage: number, checks: SafetyChecks, _measuredMv?: number) {
    if (!this.connected || this.busy || this.session.status?.estop || this.session.status?.armed || this.moving
      || !checks.wiring || !checks.physicalSwitch || !checks.raised || !checks.currentReviewed || !checks.legacyBlePowerReviewed) {
      throw new Error('BLE版の電源・100%出力条件と配線を確認してください。');
    }
    // Browser-only one-shot permission. No ARM frame and no claim that the device is armed.
    this.permitted = true; this.changed();
  }
  async drive(left: number, right: number) {
    if (!this.connected || !this.permitted || this.pressed || this.busy) return;
    const pair = bleDirections(left, right), nonce = this.session.status?.nonce, generation = this.generation;
    this.permitted = false; this.pressed = 1; this.moving = true; this.pending++; this.changed();
    try { await this.session.driveTimed(pair[0], pair[1], this.settings.pulseMs); }
    catch (error) {
      const s = this.session.status;
      // Short pulses may finish before the first readback; distinguish this from a rejected move.
      const completed = s?.bootId === this.bootId && s?.nonce !== nonce && s?.stopReason === 'pulse-limit' && !s.armed && !s.left && !s.right;
      if (!completed && generation === this.generation) { this.error = String(error); this.session.requestStop(); }
      this.pressed = 0; this.moving = false;
    } finally { this.pending--; this.observe(); }
  }
  async stop(emergency = false) {
    this.generation++; this.permitted = false; this.pressed = 0; this.moving = false;
    if (!this.connected) { this.changed(); return; }
    const before = this.ack; this.stopping++; this.session.requestStop(emergency); this.changed();
    const deadline = performance.now() + 2100;
    try {
      while (this.connected && this.ack === before && performance.now() < deadline) await new Promise(r => setTimeout(r, 10));
      const s = this.session.status;
      if (this.connected && (this.ack === before || s?.armed || s?.left || s?.right)) {
        this.error = '停止応答を確認できません。接続を解除します。'; this.disconnect();
      }
    } finally { this.stopping--; this.observe(); }
  }
  async reset() {
    if (!this.connected || this.busy) return;
    this.permitted = false; this.pending++; this.changed();
    try { await this.session.send(OPS.RESET_ESTOP); }
    catch (error) { this.error = String(error); }
    finally { this.pending--; this.observe(); }
  }
  disconnect() {
    this.generation++; this.permitted = false; this.pressed = 0; this.moving = false; this.established = false; this.bootId = null;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    if (this.session.connected) this.session.requestStop();
    this.session.disconnect(); this.changed();
  }
}
