import { validateStatus, type MotorCommand, type MotorStatus } from '../motor/protocol.ts';
import type { MotorTransport } from '../motor/transport.ts';
export class ColonBridge {
  private token = '';
  async pair(code: string): Promise<void> {
    const r = await fetch('/bridge/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await r.json();
    if (!r.ok || typeof data.token !== 'string') throw new Error('PC連携サーバーに接続できません。起動・接続コードを確認してください。');
    this.token = data.token;
  }
  async request(path: string, body?: unknown, urgent = false): Promise<unknown> {
    if (!this.token) throw new Error('PC連携が未接続です');
    const r = await fetch('/bridge/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Colon-Bridge': this.token },
      body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(path.startsWith('atom/') ? 55000 : 1200), keepalive: urgent,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? '連携エラー');
    return data;
  }
}
export class BridgeMotorTransport implements MotorTransport {
  readonly kind = 'device';
  constructor(private bridge: ColonBridge) {}
  async connect(): Promise<MotorStatus> {
    const data = await this.bridge.request('motor/session') as { status: unknown };
    const s = validateStatus(data.status);
    if (s.source !== 'device' || s.armed || s.active) throw new Error('unsafe-session');
    return s;
  }
  async send(command: MotorCommand, urgent = false): Promise<MotorStatus> {
    const s = validateStatus(await this.bridge.request('motor/' + (['STOP', 'ESTOP'].includes(command.type) ? 'stop' : 'command'), command, urgent));
    if (s.source !== 'device' || s.lastSeq < command.seq) throw new Error('stale-status');
    return s;
  }
  disconnect(): void { void this.bridge.request('motor/disconnect', {}, true).catch(() => {}); }
}
