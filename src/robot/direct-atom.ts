import type { MotorTransport } from '../motor/transport.ts';
import { validateStatus, type MotorCommand, type MotorStatus } from '../motor/protocol.ts';
export function atomHttpsOrigin(input: string): string {
  const url = new URL(input);
  const octets = url.hostname.split('.').map(Number);
  const ip = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/'
    || (!ip && url.hostname !== 'colon-atom.local')) throw new Error('AtomS3のHTTPSアドレスを入力してください（https://colon-atom.local）。');
  return url.origin;
}
/** iPhone Safari -> trusted HTTPS on AtomS3, without a PC proxy or Web Bluetooth. */
export class DirectAtomTransport implements MotorTransport {
  readonly kind = 'device';
  readonly origin: string;
  private token = '';
  private cancelled = false;
  private fetcher: typeof fetch;
  private code: string;
  constructor(origin: string, code: string, fetcher: typeof fetch = fetch) {
    this.origin = atomHttpsOrigin(origin);
    if (code.length < 12 || code.length > 64) throw new Error('AtomS3の接続コードを12〜64文字で入力してください。');
    this.code = code; this.fetcher = fetcher;
  }
  private async post(endpoint: string, body: unknown, urgent = false, initial = false): Promise<unknown> {
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), initial ? 8000 : 700);
    try {
      const r = await this.fetcher(this.origin + '/phone/' + endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Colon-Session': this.token, ...(initial ? { 'X-Colon-Pair': this.code } : {}) },
        body: JSON.stringify(body), signal: abort.signal, keepalive: urgent,
      });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? 'AtomS3通信エラー'); return data;
    } catch (error) {
      if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new Error('AtomS3に接続できません。同じWi-Fi・電源・証明書の信頼設定を確認してください。');
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
  async connect(): Promise<MotorStatus> {
    this.cancelled = false;
    const data = await this.post('session', { protocol: 1 }, false, true) as { token: string; status: unknown };
    if (!/^[0-9a-f]{32}$/.test(data.token)) throw new Error('invalid-session');
    this.token = data.token; this.code = '';
    const status = validateStatus(data.status);
    if (status.source !== 'device' || status.armed || status.active) { this.disconnect(); throw new Error('unsafe-session'); }
    if (this.cancelled) { this.disconnect(); throw new Error('connect-cancelled'); }
    return status;
  }
  async send(command: MotorCommand, urgent = false): Promise<MotorStatus> {
    const status = validateStatus(await this.post(['STOP', 'ESTOP'].includes(command.type) ? 'stop' : 'command', command, urgent));
    if (status.source !== 'device' || status.lastSeq < command.seq) throw new Error('stale-status');
    return status;
  }
  async display(emotion: string): Promise<void> {
    await this.post('display', { emotion: ['JOY', 'SURPRISE', 'SAD', 'SLEEPY', 'THINKING'].includes(emotion) ? emotion : 'NORMAL' });
  }
  disconnect(): void {
    this.cancelled = true;
    if (this.token) void this.post('disconnect', {}, true).catch(() => {});
    this.token = ''; this.code = '';
  }
}
