// Keep the upstream editor; adapt its four API routes to the paired same-origin bridge.
const nativeFetch = window.fetch.bind(window);
let bridgeToken = '';
async function pair() {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = '<form method="dialog"><h2>Colon PC連携</h2><p>このPCだけで使う場合は空欄のまま接続できます。</p><label>接続コード <input type="password" autocomplete="off"></label><p><button value="connect">接続</button><button value="cancel">キャンセル</button></p></form>';
  document.body.append(dialog); dialog.showModal();
  const code = await new Promise((resolve, reject) => dialog.addEventListener('close', () => {
    const value = dialog.querySelector('input').value;
    dialog.remove(); dialog.returnValue === 'connect' ? resolve(value) : reject(new Error('接続をキャンセルしました'));
  }, { once: true }));
  const r = await nativeFetch('/bridge/pair', { method: 'POST', headers: {'Content-Type':'application/json'}, body:JSON.stringify({code}) });
  const data = await r.json(); if (!r.ok) throw new Error('接続コードを確認し、画面を再読み込みしてください'); bridgeToken = data.token;
}
export async function fetch(url, init = {}) {
  if (!String(url).startsWith('/api/')) return nativeFetch(url, init);
  const parsed = new URL(url, location.origin), endpoint = parsed.pathname.slice(5);
  if (endpoint === 'session') { await pair(); return Response.json({token:bridgeToken}); }
  if (!bridgeToken) throw new Error('PC接続が必要です');
  const body = {device:parsed.searchParams.get('device')};
  if (endpoint === 'display') {
    const bytes = new Uint8Array(await init.body.arrayBuffer());
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); body.png = btoa(text);
  }
  return nativeFetch('/bridge/atom/' + endpoint, { method:'POST', headers:{'Content-Type':'application/json','X-Colon-Bridge':bridgeToken}, body:JSON.stringify(body), signal:init.signal });
}
