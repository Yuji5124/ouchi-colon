import { MockMotorCore } from './mock-core.ts';
import { validateStatus, type MotorCommand, type MotorStatus } from './protocol.ts';
export interface MotorTransport {
  readonly kind: 'mock' | 'device';
  connect(): Promise<MotorStatus>;
  send(command: MotorCommand, urgent?: boolean): Promise<MotorStatus>;
  disconnect(): void;
}
export class MockMotorTransport implements MotorTransport {
  readonly kind = 'mock';
  readonly core = new MockMotorCore();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly clock: () => number;
  constructor(clock: () => number = () => Math.floor(performance.now())) { this.clock = clock; }
  async connect(): Promise<MotorStatus> {
    const status = this.core.connect(this.clock());
    this.timer = setInterval(() => this.core.tick(this.clock()), 10);
    return status;
  }
  async send(command: MotorCommand): Promise<MotorStatus> { return this.core.command(command, this.clock()); }
  disconnect(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.core.disconnect(this.clock()); }
}
/** Device HTTP stays same-origin; no insecure request from GitHub Pages. */
export class HttpMotorTransport implements MotorTransport {
  readonly kind = 'device';
  private token = '';
  private readonly origin: string;
  private readonly fetcher: typeof fetch;
  constructor(origin: string, fetcher: typeof fetch = fetch) {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.hostname !== '192.168.4.1' || url.port) throw new Error('open-device-page');
    this.origin = url.origin; this.fetcher = fetcher;
  }
  private async post(path: string, body: unknown, urgent = false): Promise<unknown> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 400);
    try {
      const response = await this.fetcher(this.origin + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Colon-Session': this.token },
        body: JSON.stringify(body), signal: abort.signal, keepalive: urgent, cache: 'no-store',
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'device-request-failed');
      return data;
    } finally { clearTimeout(timeout); }
  }
  async connect(): Promise<MotorStatus> {
    const data = await this.post('/api/session', { protocol: 1 }) as { token: string; status: unknown };
    if (typeof data.token !== 'string' || !/^[0-9a-f]{32}$/.test(data.token)) throw new Error('invalid-session');
    this.token = data.token;
    const status = validateStatus(data.status);
    if (status.source !== 'device' || status.armed || status.active) throw new Error('unsafe-session');
    return status;
  }
  async send(command: MotorCommand, urgent = false): Promise<MotorStatus> {
    const data = await this.post(command.type === 'STOP' || command.type === 'ESTOP' ? '/api/stop' : '/api/command', command, urgent);
    const status = validateStatus(data);
    if (status.source !== 'device' || status.lastSeq < command.seq) throw new Error('stale-status');
    return status;
  }
  disconnect(): void {
    if (this.token) void this.post('/api/disconnect', {}, true).catch(() => {});
    this.token = '';
  }
}
