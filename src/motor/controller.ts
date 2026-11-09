import type { MotorCommand, MotorSettings, MotorStatus, SafetyChecks } from './protocol.ts';
import type { MotorTransport } from './transport.ts';
export class MotorTestController {
  status: MotorStatus | null = null;
  connected = false; permitted = false; pressed = 0; error = ''; lastReceivedAt = '';
  private readonly transport: MotorTransport;
  private readonly changed: () => void;
  private readonly event: (operation: string, result: string, error?: string) => void;
  private pending = 0; private stopping = 0;
  get busy(): boolean { return this.pending > 0 || this.stopping > 0; }
  private seq = 0; private generation = 0; private pressCounter = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(transport: MotorTransport, changed = () => {}, event = (_operation: string, _result: string, _error?: string) => {}) {
    this.transport = transport; this.changed = changed; this.event = event;
  }
  private apply(status: MotorStatus): void {
    if (this.status && status.bootId !== this.status.bootId) throw new Error('device-restarted');
    if (this.status && status.lastSeq < this.status.lastSeq) return;
    this.status = status; this.lastReceivedAt = new Date().toISOString();
    if (!status.armed) { this.permitted = false; this.pressed = 0; }
    if (!status.connected) throw new Error('device-link-expired');
  }
  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : 'communication-error';
    this.permitted = false; this.pressed = 0; this.connected = false; this.generation++;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    void this.transport.send({ type: 'STOP', seq: ++this.seq }, true).catch(() => {}).finally(() => this.transport.disconnect());
    this.event('connection-lost', '停止要求・実機状態未確認', this.error); this.changed();
  }
  async connect(): Promise<void> {
    const generation = ++this.generation;
    this.pending++; this.permitted = false; this.error = ''; this.changed();
    try {
      const status = await this.transport.connect();
      if (generation !== this.generation) { this.transport.disconnect(); return; }
      this.status = null; this.seq = status.lastSeq; this.apply(status); this.connected = true;
      this.timer = setInterval(() => { void this.heartbeat(); }, 80);
      this.event('connect', '接続・駆動許可なし');
    } catch (error) { this.fail(error); } finally { this.pending--; this.changed(); }
  }
  private async request(partial: Omit<MotorCommand, 'seq'>): Promise<boolean> {
    if (!this.connected || this.busy) return false;
    const generation = this.generation; this.pending++; this.changed();
    try {
      const status = await this.transport.send({ ...partial, seq: ++this.seq });
      if (generation !== this.generation) return false;
      this.apply(status); this.error = '';
      if (partial.type !== 'HOLD' && partial.type !== 'HEARTBEAT') this.event(partial.type === 'DRIVE' ? `DRIVE left=${partial.left} right=${partial.right}` : partial.type, status.stopReason);
      return true;
    } catch (error) { if (generation === this.generation) this.fail(error); return false; }
    finally { this.pending--; this.changed(); }
  }
  private async heartbeat(): Promise<void> {
    if (!this.connected || this.busy) return;
    const before = this.status?.stopReason;
    await this.request(this.pressed ? { type: 'HOLD', press: this.pressed } : { type: 'HEARTBEAT' });
    if (this.status?.stopReason !== before) this.event('device-stop', this.status?.stopReason ?? 'unknown');
  }
  async arm(stage: number, checks: SafetyChecks, measuredMv?: number): Promise<void> {
    if (await this.request({ type: 'ARM', stage, checks, measuredMv })) this.permitted = Boolean(this.status?.armed);
    this.changed();
  }
  async configure(settings: MotorSettings): Promise<void> { await this.request({ type: 'CONFIG', settings }); }
  async reset(): Promise<void> { await this.request({ type: 'RESET' }); }
  async drive(left: number, right: number): Promise<void> {
    if (!this.permitted || this.pressed || this.busy) return;
    this.pressed = ++this.pressCounter; this.changed();
    await this.request({ type: 'DRIVE', press: this.pressed, left, right });
  }
  async stop(emergency = false): Promise<void> {
    this.generation++; this.permitted = false; this.pressed = 0;
    if (!this.connected) { this.changed(); return; }
    const generation = this.generation; this.stopping++; this.changed();
    try {
      const status = await this.transport.send({ type: emergency ? 'ESTOP' : 'STOP', seq: ++this.seq }, true);
      if (generation === this.generation) { this.apply(status); this.event(emergency ? 'ESTOP' : 'STOP', status.stopReason); }
    } catch (error) { if (generation === this.generation) this.fail(error); }
    finally { this.stopping--; this.changed(); }
  }
  disconnect(): void {
    void this.stop(); this.connected = false; this.generation++;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.transport.disconnect(); this.changed(); this.event('disconnect', '停止要求・接続解除');
  }
}
