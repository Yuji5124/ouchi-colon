import assert from 'node:assert/strict';
import test from 'node:test';
import { MockMotorCore } from '../src/motor/mock-core.ts';
import { DEFAULT_MOTOR_SETTINGS, validPins, validateStatus, type MotorCommand, type MotorSettings, type SafetyChecks } from '../src/motor/protocol.ts';
import { INITIAL_POWER_NOTES, MotorDiagnostics, validatePowerNotes, type DiagnosticEntry } from '../src/motor/diagnostics.ts';
import { HttpMotorTransport, MockMotorTransport } from '../src/motor/transport.ts';
import { MotorTestController } from '../src/motor/controller.ts';
const checks: SafetyChecks = { wiring: true, physicalSwitch: true, raised: true, vmOff: true, voltageMeasured: true, currentReviewed: true };
function send(core: MockMotorCore, cmd: Omit<MotorCommand, 'seq'>, now = 0) { return core.command({ ...cmd, seq: core.lastSeq + 1 }, now); }
function setup(settings: Partial<MotorSettings> = {}) {
  const core = new MockMotorCore(); core.connect(0); send(core, { type: 'CONFIG', settings: { ...DEFAULT_MOTOR_SETTINGS, ...settings } });
  send(core, { type: 'ARM', stage: 2, checks }); return core;
}
test('motor starts stopped and rejects drive until GPIO and explicit checks are ready', () => {
  const core = new MockMotorCore(); assert.equal(core.armed, false); assert.equal(core.left, 0); core.connect(0);
  assert.throws(() => send(core, { type: 'DRIVE', left: 1, right: 1, press: 1 }), /drive-denied/);
  assert.throws(() => send(core, { type: 'ARM', stage: 2, checks: { ...checks, wiring: false } }), /arm-denied/);
  const conflict = new MockMotorCore([5, 6, 5, 8]); conflict.connect(0);
  assert.throws(() => send(conflict, { type: 'ARM', stage: 2, checks }), /arm-denied/);
  assert.equal(validPins([5, 6, 7, 8]), true); assert.equal(validPins([5, 6, 38, 39]), false); assert.equal(validPins([5, 6, 7, 16]), false);
});
test('left and right control and direction inversion remain independent', () => {
  const core = setup({ invertRight: true }); send(core, { type: 'DRIVE', left: 1, right: 0, press: 1 }); core.tick(10);
  assert.equal(core.left, 10); assert.equal(core.right, 0); send(core, { type: 'STOP' }, 20);
  send(core, { type: 'ARM', stage: 2, checks }, 20); send(core, { type: 'DRIVE', left: 0, right: 1, press: 2 }, 20); core.tick(30);
  assert.equal(core.left, 0); assert.equal(core.right, -10);
});
test('bad PWM settings, non-finite values and oversized pulses are rejected', () => {
  for (const patch of [{ leftPercent: -1 }, { rightPercent: 101 }, { leftPercent: 0.5 }, { leftPercent: NaN }, { pwmHz: Infinity }, { pwmHz: 20001 }, { pulseMs: 501 }, { softStartMs: 0 }]) {
    const core = new MockMotorCore(); core.connect(0);
    assert.throws(() => send(core, { type: 'CONFIG', settings: { ...DEFAULT_MOTOR_SETTINGS, ...patch } }), /invalid-settings/);
    assert.equal(core.active, false); assert.equal(core.armed, false);
  }
  const core = setup(); assert.throws(() => send(core, { type: 'CONFIG', settings: DEFAULT_MOTOR_SETTINGS }), /config-while-armed/); assert.equal(core.armed, false);
});
test('holding cannot extend the maximum pulse and a late HOLD cannot restart it', () => {
  const core = setup({ pulseMs: 500 }); send(core, { type: 'DRIVE', left: 1, right: 1, press: 1 });
  for (let now = 80; now < 500; now += 80) send(core, { type: 'HOLD', press: 1 }, now);
  core.tick(500); assert.equal(core.stopReason, 'pulse-limit'); assert.equal(core.armed, false); assert.equal(core.left, 0);
  send(core, { type: 'HOLD', press: 1 }, 510); assert.equal(core.active, false);
});
test('a heartbeat is not a hold and cannot keep a released motor running', () => {
  const core = setup({ pulseMs: 500 }); send(core, { type: 'DRIVE', left: 1, right: 0, press: 1 });
  send(core, { type: 'HEARTBEAT' }, 100); send(core, { type: 'HEARTBEAT' }, 200); core.tick(220);
  assert.equal(core.stopReason, 'hold-timeout'); assert.equal(core.left, 0); assert.equal(core.armed, false);
});
test('communication expiry and reconnect never restore the previous drive permission', () => {
  const core = setup(); core.tick(1000); assert.equal(core.connected, false); assert.equal(core.armed, false);
  core.connect(1001); assert.equal(core.active, false); assert.equal(core.armed, false);
  assert.throws(() => send(core, { type: 'DRIVE', left: 1, right: 1, press: 2 }, 1001), /drive-denied/);
});
test('direction changes coast for 100ms before ramping in reverse', () => {
  const core = setup({ leftPercent: 100, pulseMs: 500 }); send(core, { type: 'DRIVE', left: 1, right: 0, press: 1 }); core.tick(50);
  assert.equal(core.left, 50); send(core, { type: 'STOP' }, 50); send(core, { type: 'ARM', stage: 2, checks }, 60);
  send(core, { type: 'DRIVE', left: -1, right: 0, press: 2 }, 60); core.tick(140); assert.equal(core.left, 0);
  core.tick(150); assert.equal(core.left, -10);
});
test('emergency stop stays latched until reset, and reset does not arm', () => {
  const core = setup(); send(core, { type: 'DRIVE', left: 1, right: 1, press: 1 }); send(core, { type: 'ESTOP' }, 10);
  core.disconnect(11); core.connect(12); assert.equal(core.estop, true);
  assert.throws(() => send(core, { type: 'ARM', stage: 2, checks }, 12), /arm-denied/);
  send(core, { type: 'RESET' }, 13); assert.equal(core.estop, false); assert.equal(core.armed, false);
});
test('a delayed drive cannot overtake a newer stop and restart the motor', () => {
  const core = setup(); const drive: MotorCommand = { type: 'DRIVE', seq: core.lastSeq + 1, left: 1, right: 0, press: 1 };
  core.command({ type: 'STOP', seq: drive.seq + 1 }, 10);
  assert.throws(() => core.command(drive, 20), /stale-sequence/); assert.equal(core.active, false); assert.equal(core.armed, false);
});
test('motor timers handle the 32-bit millisecond rollover', () => {
  const core = new MockMotorCore(); const start = 0xffffffd0;
  core.connect(start); send(core, { type: 'ARM', stage: 2, checks }, start); send(core, { type: 'DRIVE', left: 1, right: 1, press: 1 }, start);
  core.tick((start + 99) >>> 0); assert.equal(core.active, true); core.tick((start + 100) >>> 0); assert.equal(core.active, false);
});
test('motor-stage confirmation needs a reported voltage at or below 1.5V', () => {
  const core = new MockMotorCore(); core.connect(0);
  for (const measuredMv of [undefined, 0, 1501, NaN]) assert.throws(() => send(core, { type: 'ARM', stage: 5, checks, measuredMv }), /arm-denied/);
  send(core, { type: 'ARM', stage: 5, checks, measuredMv: 1500 }); assert.equal(core.armed, true); assert.equal(core.status(0).outputsEnabled, false);
});
test('the mock watchdog advances without new browser commands', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] }); let now = 0;
  const transport = new MockMotorTransport(() => now); await transport.connect(); t.after(() => transport.disconnect());
  await transport.send({ type: 'ARM', seq: 1, stage: 2, checks }); await transport.send({ type: 'DRIVE', seq: 2, left: 1, right: 1, press: 1 });
  now = 100; t.mock.timers.tick(100); assert.equal(transport.core.active, false); assert.equal(transport.core.stopReason, 'pulse-limit');
});
test('diagnostics distinguish manual input and unknown sensors, stay bounded and export safe CSV', () => {
  const diagnostics = new MotorDiagnostics(); const power = { ...INITIAL_POWER_NOTES, drivingPower: '=SUM(1,2)' };
  const entry: DiagnosticEntry = { at: '2026-11-03T00:00:00Z', source: 'manual', phase: 7, connection: false, uptimeMs: null, resetReason: '未取得', operation: 'power-note', left: 0, right: 0, pwmHz: 1000, settings: { ...DEFAULT_MOTOR_SETTINGS }, stopReason: '未取得', power, result: 'not measured', error: '' };
  diagnostics.add(entry); power.settingV = 9;
  const result = JSON.parse(diagnostics.json()); assert.equal(result.entries[0].power.settingV, 1.5); assert.equal(result.entries[0].power.measuredV, null);
  assert.equal(result.sensors.converterOutputV, null); assert.match(diagnostics.csv(), /"'=SUM\(1,2\)"/);
  for (let i = 0; i < 600; i++) diagnostics.add(entry); assert.equal(diagnostics.entries.length, 500);
  assert.throws(() => validatePowerNotes({ ...INITIAL_POWER_NOTES, measuredV: NaN }), /invalid-power-notes/);
});
test('real transport refuses HTTPS Pages and arbitrary hosts instead of using mixed content', () => {
  for (const origin of ['https://yuji5124.github.io', 'http://localhost:5173', 'http://192.168.4.1:80', 'http://example.com']) {
    // Explicit :80 is normalized by URL and is equivalent to the expected origin.
    if (origin.endsWith(':80')) continue;
    assert.throws(() => new HttpMotorTransport(origin), /open-device-page/);
  }
  assert.throws(() => validateStatus({}), /invalid-settings/);
});
test('real transport validates session, source and command sequence acknowledgement', async () => {
  const state = { ...new MockMotorCore().connect(0), source: 'device' as const, firmware: 'test-device' };
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    calls.push(String(url)); return new Response(JSON.stringify(String(url).endsWith('/session') ? { token: 'a'.repeat(32), status: state } : state), { status: 200 });
  }) as typeof fetch;
  const transport = new HttpMotorTransport('http://192.168.4.1', fetcher); await transport.connect();
  await assert.rejects(transport.send({ type: 'HEARTBEAT', seq: 1 }), /stale-status/);
  assert.deepEqual(calls, ['http://192.168.4.1/api/session', 'http://192.168.4.1/api/command']);
});
test('releasing while a drive request is delayed does not revive UI or mock motors', async t => {
  class DelayedTransport extends MockMotorTransport {
    release: (() => void) | null = null;
    override send(cmd: MotorCommand): Promise<ReturnType<MockMotorCore['status']>> {
      if (cmd.type !== 'DRIVE') return super.send(cmd);
      return new Promise((resolve, reject) => { this.release = () => { try { resolve(this.core.command(cmd, 0)); } catch (error) { reject(error); } }; });
    }
  }
  const transport = new DelayedTransport(() => 0); const controller = new MotorTestController(transport); t.after(() => controller.disconnect());
  await controller.connect(); await controller.arm(2, checks); const pending = controller.drive(1, 0); await controller.stop();
  transport.release!(); await pending; assert.equal(controller.permitted, false); assert.equal(controller.pressed, 0);
  assert.equal(transport.core.active, false); assert.equal(transport.core.armed, false);
});
test('a changed boot identity disables the controller instead of silently rearming', async t => {
  class RebootTransport extends MockMotorTransport {
    reboot = false;
    override async send(cmd: MotorCommand) { const result = await super.send(cmd); return this.reboot ? { ...result, bootId: 'restarted' } : result; }
  }
  const transport = new RebootTransport(() => 0); const controller = new MotorTestController(transport); t.after(() => controller.disconnect());
  await controller.connect(); await controller.arm(2, checks); transport.reboot = true; await controller.reset();
  assert.equal(controller.connected, false); assert.equal(controller.permitted, false); assert.match(controller.error, /device-restarted/);
});


test('pending STOP blocks rearming until the stop acknowledgement is received', async t => {
  class DelayedStop extends MockMotorTransport {
    release: (() => void) | null = null;
    delayed = false;
    armRequests = 0;
    override send(cmd: MotorCommand): Promise<ReturnType<MockMotorCore['status']>> {
      if (cmd.type === 'ARM') this.armRequests++;
      if (cmd.type !== 'STOP' || this.delayed) return super.send(cmd);
      this.delayed = true;
      return new Promise((resolve, reject) => { this.release = () => { try { resolve(this.core.command(cmd, 0)); } catch (error) { reject(error); } }; });
    }
  }
  const transport = new DelayedStop(() => 0), controller = new MotorTestController(transport);
  t.after(() => controller.disconnect());
  await controller.connect(); await controller.arm(2, checks);
  const pending = controller.stop(); assert.equal(controller.busy, true);
  await controller.arm(2, checks); assert.equal(transport.armRequests, 1);
  transport.release!(); await pending;
  assert.equal(controller.busy, false); assert.equal(controller.permitted, false); assert.equal(transport.core.armed, false);
});
