import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createIntegratedHandler } from '../server/integrated.mjs';
test('bridge enforces origin, pairing and fixed device route; hides device token', async () => {
  const calls = [];
  let handler;
  const server = http.createServer((req,res) => handler(req,res)); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  handler = createIntegratedHandler({origin:base, code:'test-code',fetcher:async(url,init)=>{calls.push({url,init});return Response.json({token:'a'.repeat(32),status:{armed:false}});}});
  const request = (path, body = {}, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await request('/bridge/pair', {code:'test-code'}, {Origin:'https://example.com'})).status, 403);
    assert.equal((await request('/bridge/pair', {code:'wrong'})).status, 403);
    assert.equal((await request('/bridge/motor/session')).status, 403);
    const token = (await (await request('/bridge/pair', {code:'test-code'})).json()).token;
    const headers = {'X-Colon-Bridge':token};
    const result = await (await request('/bridge/motor/session', {}, headers)).json();
    assert.equal(result.token, undefined); assert.equal(calls[0].url, 'http://192.168.4.1/api/session');
    assert.equal((await request('/bridge/motor/http://elsewhere', {}, headers)).status, 404);
    assert.equal((await request('/bridge/atom/display', {device:1,png:'bad://'}, headers)).status, 502);
  } finally { await new Promise(r => server.close(r)); }
});
test('LAN publication requires HTTPS and a pairing code', () => {
  assert.throws(() => createIntegratedHandler({origin:'http://192.168.1.5:18181'}));
  assert.throws(() => createIntegratedHandler({origin:'https://192.168.1.5:18181',code:'short'}));
});
