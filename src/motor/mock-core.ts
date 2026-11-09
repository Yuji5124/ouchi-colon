import { DEFAULT_MOTOR_SETTINGS, HOLD_TIMEOUT_MS, LINK_TIMEOUT_MS, REVERSAL_PAUSE_MS, validPins, validateSettings, type MotorCommand, type MotorSettings, type MotorStatus } from './protocol.ts';
const elapsed = (now: number, before: number): number => (now - before) >>> 0;
/** Simulation only. The physical safety controller runs independently on AtomS3. */
export class MockMotorCore {
  settings: MotorSettings = { ...DEFAULT_MOTOR_SETTINGS };
  connected = false; armed = false; estop = false; active = false; stage = 2;
  left = 0; right = 0; targetLeft = 0; targetRight = 0; lastSeq = 0;
  stopReason = 'boot'; lastHeartbeatMs = 0;
  private start = 0; private hold = 0; private lastTick = 0; private pauseMs = 0;
  private press = 0; private lastPress = 0; private lastLeftDirection = 0; private lastRightDirection = 0; private stoppedAt = 0;
  readonly gpioReady: boolean;
  constructor(pins: readonly number[] = [5, 6, 7, 8]) { this.gpioReady = validPins(pins); }
  connect(now: number): MotorStatus {
    this.stop('connected-disarmed', now); this.connected = true; this.lastSeq = 0; this.lastPress = 0;
    this.lastHeartbeatMs = now; return this.status(now);
  }
  stop(reason: string, now: number): void {
    if (this.active) this.stoppedAt = now;
    this.armed = false; this.active = false; this.left = this.right = this.targetLeft = this.targetRight = 0;
    this.stopReason = reason;
  }
  disconnect(now: number): void { this.stop('disconnected', now); this.connected = false; }
  command(c: MotorCommand, now: number): MotorStatus {
    this.tick(now);
    if (!this.connected) throw new Error('not-connected');
    if (!Number.isInteger(c.seq) || c.seq < 1 || c.seq > 2147483647) { this.stop('invalid-sequence', now); throw new Error('invalid-sequence'); }
    if (c.type === 'STOP' || c.type === 'ESTOP' || c.type === 'DISARM') {
      this.lastSeq = Math.max(this.lastSeq, c.seq); if (c.type === 'ESTOP') this.estop = true;
      this.stop(c.type.toLowerCase(), now); return this.status(now);
    }
    if (c.seq <= this.lastSeq) throw new Error('stale-sequence');
    this.lastSeq = c.seq;
    if (c.type === 'HEARTBEAT') this.lastHeartbeatMs = now;
    else if (c.type === 'RESET') { this.stop('reset-disarmed', now); this.estop = false; }
    else if (c.type === 'CONFIG') {
      if (this.armed || this.active) { this.stop('config-while-armed', now); throw new Error('config-while-armed'); }
      try { validateSettings(c.settings!); } catch { this.stop('invalid-settings', now); throw new Error('invalid-settings'); }
      this.settings = { ...c.settings! };
    } else if (c.type === 'ARM') {
      const checks = c.checks;
      if (!this.gpioReady || this.estop || !checks?.wiring || !checks.physicalSwitch || !checks.raised
        || !Number.isInteger(c.stage) || c.stage! < 2 || c.stage! > 7
        || (c.stage! <= 4 && !checks.vmOff)
        || (c.stage! >= 5 && (!checks.voltageMeasured || !checks.currentReviewed || !Number.isInteger(c.measuredMv) || c.measuredMv! <= 0 || c.measuredMv! > 1500))) {
        this.stop('arm-denied', now); throw new Error('arm-denied');
      }
      this.stage = c.stage!; this.armed = true; this.stopReason = 'armed'; this.lastHeartbeatMs = now;
    } else if (c.type === 'DRIVE') {
      if (!this.armed || this.estop || ![-1, 0, 1].includes(c.left!) || ![-1, 0, 1].includes(c.right!)
        || !Number.isInteger(c.press) || c.press! > 2147483647 || c.press! <= this.lastPress) { this.stop('drive-denied', now); throw new Error('drive-denied'); }
      const l = c.left! * this.settings.leftPercent * (this.settings.invertLeft ? -1 : 1) || 0;
      const r = c.right! * this.settings.rightPercent * (this.settings.invertRight ? -1 : 1) || 0;
      const reversing = (l && this.lastLeftDirection && Math.sign(l) !== this.lastLeftDirection)
        || (r && this.lastRightDirection && Math.sign(r) !== this.lastRightDirection);
      this.pauseMs = reversing ? Math.max(0, REVERSAL_PAUSE_MS - elapsed(now, this.stoppedAt)) : 0;
      if (this.active) { this.stop('release-before-next-drive', now); throw new Error('release-before-next-drive'); }
      this.press = this.lastPress = c.press!; this.targetLeft = l; this.targetRight = r;
      this.start = this.hold = this.lastTick = now; this.active = Boolean(l || r);
      if (!this.active) this.stop('zero-speed', now);
    } else if (c.type === 'HOLD') {
      if (c.press !== this.press) throw new Error('invalid-hold');
      if (this.active) this.hold = now;
      this.lastHeartbeatMs = now;
    } else { this.stop('invalid-command', now); throw new Error('invalid-command'); }
    return this.status(now);
  }
  tick(now: number): void {
    if (this.connected && elapsed(now, this.lastHeartbeatMs) >= LINK_TIMEOUT_MS) { this.disconnect(now); this.stopReason = 'link-timeout'; return; }
    if (!this.active) return;
    if (elapsed(now, this.start) >= this.settings.pulseMs) { this.stop('pulse-limit', now); return; }
    if (elapsed(now, this.hold) >= HOLD_TIMEOUT_MS) { this.stop('hold-timeout', now); return; }
    if (elapsed(now, this.start) < this.pauseMs) { this.lastTick = now; return; }
    const dt = elapsed(now, this.lastTick); if (!dt) return;
    const step = Math.max(1, Math.floor(dt * 100 / this.settings.softStartMs)); this.lastTick = now;
    this.left = Math.sign(this.targetLeft) * Math.min(Math.abs(this.targetLeft), Math.abs(this.left) + step);
    this.right = Math.sign(this.targetRight) * Math.min(Math.abs(this.targetRight), Math.abs(this.right) + step);
    if (this.left) this.lastLeftDirection = Math.sign(this.left);
    if (this.right) this.lastRightDirection = Math.sign(this.right);
  }
  status(now: number): MotorStatus {
    return { protocol: 1, source: 'mock', firmware: 'mock-1.0.0', bootId: 'mock-boot-1', bootCount: 1, resetReason: 'simulation', uptimeMs: now >>> 0,
      lastHeartbeatMs: this.lastHeartbeatMs >>> 0, connected: this.connected, gpioReady: this.gpioReady, outputsEnabled: false, powerQualified: false,
      armed: this.armed, estop: this.estop, active: this.active, left: this.left, right: this.right, targetLeft: this.targetLeft, targetRight: this.targetRight,
      stopReason: this.stopReason, lastSeq: this.lastSeq, stage: this.stage, settings: { ...this.settings } };
  }
}
