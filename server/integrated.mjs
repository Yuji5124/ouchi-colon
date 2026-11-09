import http from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const motorBase = 'http://192.168.4.1';
const atomBase = 'http://127.0.0.1:18180';
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function body(req) {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 300000) throw new Error('request-too-large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
export function createIntegratedHandler({ origin = 'http://127.0.0.1:18181', code = '', fetcher = fetch, startAtom = () => {} } = {}) {
  const allowed = new URL(origin), sessions = new Map();
  const loopback = ['127.0.0.1', 'localhost'].includes(allowed.hostname);
  if (!loopback && (allowed.protocol !== 'https:' || code.length < 12)) throw new Error('LAN公開には信頼済みHTTPSと12文字以上の接続コードが必要です');
  let pairingWindow = Date.now(), attempts = 0;
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.headers.host !== allowed.host || (req.headers.origin && req.headers.origin !== allowed.origin)) return json(res, 403, { error: 'origin-denied' });
    const path = new URL(req.url, allowed.origin).pathname;
    try {
      if (path.startsWith('/bridge/')) {
        if (req.method !== 'POST') return json(res, 405, { error: 'post-required' });
        const input = await body(req);
        if (path === '/bridge/pair') {
          if (Date.now() - pairingWindow > 60000) { attempts = 0; pairingWindow = Date.now(); }
          if (++attempts > 20) return json(res, 429, { error: 'pair-rate-limit' });
          if (!equal(input.code, code)) return json(res, 403, { error: 'pair-denied' });
          for (const [key, s] of sessions) if (Date.now() - s.used > 3600000) sessions.delete(key);
          if (sessions.size >= 20) return json(res, 429, { error: 'too-many-sessions' });
          const token = randomBytes(32).toString('hex'); sessions.set(token, { motor: '', atom: '', used: Date.now() }); return json(res, 200, { token });
        }
        const session = sessions.get(req.headers['x-colon-bridge']);
        if (!session || Date.now() - session.used > 3600000) return json(res, 403, { error: 'pair-required' });
        session.used = Date.now();
        if (path.startsWith('/bridge/motor/')) {
          const endpoint = path.slice('/bridge/motor/'.length);
          if (!['session', 'command', 'stop', 'disconnect'].includes(endpoint)) return json(res, 404, { error: 'unknown-motor-route' });
          if (endpoint !== 'session' && !session.motor) return json(res, 409, { error: 'motor-not-connected' });
          const response = await fetcher(motorBase + '/api/' + endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Colon-Session': session.motor, Origin: motorBase },
            body: JSON.stringify(endpoint === 'session' ? { protocol: 1 } : input), signal: AbortSignal.timeout(600), redirect: 'error',
          });
          const data = await response.json();
          if (endpoint === 'session' && response.ok) {
            if (!/^[0-9a-f]{32}$/.test(data.token ?? '')) throw new Error('invalid-device-session');
            session.motor = data.token;
            return json(res, 200, { status: data.status });
          }
          if (endpoint === 'disconnect') session.motor = '';
          return json(res, response.status, data);
        }
        if (path.startsWith('/bridge/atom/')) {
          const endpoint = path.slice('/bridge/atom/'.length);
          if (!['start', 'status', 'display', 'clear'].includes(endpoint)) return json(res, 404, { error: 'unknown-atom-route' });
          if (endpoint === 'start') startAtom();
          if (!session.atom) {
            const r = await fetcher(atomBase + '/api/session', { signal: AbortSignal.timeout(4000), redirect: 'error' });
            if (!r.ok) throw new Error('Atomアプリがまだ起動中です。少し待って再度接続してください');
            const data = await r.json(); if (typeof data.token !== 'string') throw new Error('invalid-atom-session'); session.atom = data.token;
          }
          let bytes;
          if (endpoint === 'display') {
            if (!/^[1-9]\d{0,2}$/.test(String(input.device)) || Number(input.device) > 255 || typeof input.png !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(input.png)) throw new Error('invalid-display');
            bytes = Buffer.from(input.png, 'base64');
          }
          const response = await fetcher(atomBase + '/api/' + endpoint + (endpoint === 'display' || endpoint === 'clear' ? '?device=' + encodeURIComponent(input.device) : ''), {
            method: endpoint === 'status' ? 'GET' : 'POST', headers: { 'X-Colon-Token': session.atom, ...(bytes ? { 'Content-Type': 'image/png' } : {}) },
            body: bytes, signal: AbortSignal.timeout(endpoint === 'display' ? 50000 : 10000), redirect: 'error',
          });
          return json(res, response.status, await response.json());
        }
        return json(res, 404, { error: 'unknown-route' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'get-required' });
      const base = resolve(root, 'dist');
      let relative = decodeURIComponent(path).replace(/^\/ouchi-colon\/?/, '').replace(/^\//, '') || 'index.html';
      if (relative === 'atom/') relative += 'index.html';
      const file = resolve(base, relative);
      if (!file.startsWith(base + sep)) return json(res, 403, { error: 'path-denied' });
      const info = await stat(file); if (!info.isFile()) return json(res, 404, { error: 'not-found' });
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (e) { json(res, 502, { error: e.name === 'TimeoutError' ? '通信タイムアウト・動作停止を確認してください' : e.message }); }
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = process.env.COLON_PUBLIC_ORIGIN || 'http://127.0.0.1:18181';
  const url = new URL(origin); let child;
  const startAtom = () => { if (!child) { child = spawn(process.execPath, [resolve(root, 'integrations/colon-atom-app/server.mjs')], { windowsHide: true, stdio: 'ignore' }); child.on('exit', () => { child = null; }); child.on('error', () => { child = null; }); } };
  const handler = createIntegratedHandler({ origin, code: process.env.COLON_PAIR_CODE || '', startAtom });
  const server = url.protocol === 'https:' ? https.createServer({ cert: await readFile(process.env.COLON_TLS_CERT), key: await readFile(process.env.COLON_TLS_KEY) }, handler) : http.createServer(handler);
  server.requestTimeout = 60000;
  server.listen(Number(url.port || (url.protocol === 'https:' ? 443 : 80)), ['localhost', '127.0.0.1'].includes(url.hostname) ? '127.0.0.1' : '0.0.0.0', () => console.log('Colon統合版: ' + origin + '/ouchi-colon/?debug=1'));
  const stop = () => { child?.kill(); server.close(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
