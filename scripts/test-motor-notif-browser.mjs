import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(check,description,timeout=10000){
  const start=Date.now();let last;
  while(Date.now()-start<timeout){try{const x=await check();if(x)return x;}catch(e){last=e;}await sleep(25);}
  throw new Error(description,{cause:last});
}
await mkdir('work',{recursive:true});
const profile=await mkdtemp(resolve('work/program-chrome-'));
const chrome=spawn(process.env.CHROME_BIN??'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{stdio:['ignore','ignore','inherit'],windowsHide:true});
const {startNotifFixture}=await import('./lib/notif-fixture.mjs');
const fixture=await startNotifFixture(undefined,{readMs:400,writeMs:80});
let socket;
try{
  const port=(await waitFor(()=>readFile(resolve(profile,'DevToolsActivePort'),'utf8'),'Chrome debugging port')).split('\n')[0].trim();
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  const pending=new Map();let id=0; socket.addEventListener('close',e=>{for(const p of pending.values())p.reject(new Error('CDP socket closed '+e.code+' '+e.reason));pending.clear();});
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const seq=++id;const timer=setTimeout(()=>{pending.delete(seq);reject(new Error('CDP timeout '+method));},8000);pending.set(seq,{resolve:x=>{clearTimeout(timer);resolve(x);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:seq,method,params}));});
  const evalPage=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:fixture.base+'/ouchi-colon/?motor=1&transport=notif'});
  const text=s=>evalPage('document.querySelector('+JSON.stringify(s)+').textContent');
  await waitFor(()=>evalPage("document.querySelector('#mode')?.value==='notif'"),'server default');
  await evalPage("document.querySelector('#connect').click()");
  await waitFor(()=>evalPage("!!document.querySelector('dialog[open]')"),'server device picker');
  await evalPage("document.querySelector('dialog .motor-primary').click()");
  await waitFor(async()=> (await text('#rc-badge')).includes('停止中'),'server connection');
  assert.match(await text('#telemetry'),/Notifサーバー接続済み/);
  assert.ok(fixture.frames.every(frame=>![3,9].includes(frame[1])),'connect never drives');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW'});
  await waitFor(async()=> (await text('#left-state')).includes('正転'),'W through real HTTP and server');
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'});
  await waitFor(async()=> (await text('#left-state')).includes('0%'),'release stop');
  await waitFor(()=>evalPage("!document.querySelector('[data-action=A01]').disabled"),'release STOP acknowledgement complete');
  const actionStart=fixture.frames.length;
  for(const action of ['A01','A01','A01','A02','A03','A06','A11','A12']){
    await waitFor(()=>evalPage("!document.querySelector('[data-action="+action+"]').disabled"),'action ready');
    await evalPage("document.querySelector('[data-action="+action+"]').click()");
    await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes(action+' · 完了'),'calibrated '+action+' through delayed HTTP');
  }
  const actionFrames=fixture.frames.slice(actionStart);
  assert.equal(actionFrames.filter(frame=>frame[1]===4).length,0,'normal actions never emit an intermediate STOP');
  assert.deepEqual(actionFrames.filter(frame=>frame[1]===3).map(frame=>new DataView(new Uint8Array(frame).buffer).getUint16(17,true)),[250,250,250,500,750,750,1500,1500]);
  await evalPage("document.querySelector('#pattern-read').click()");
  await waitFor(async()=> (await text('#pattern-message')).includes('読み込みました'),'NVS read');
  fixture.core.state.firmware='colon-motor-1.8.0';fixture.core.state.patternsVersion=6;
  await waitFor(async()=> (await text('#rc-help')).includes('1.9.0'),'legacy firmware requires calibration update');
  assert.equal(await evalPage("document.querySelector('[data-action=A01]').disabled"),true,'old angles cannot run from the new UI');
  await evalPage("document.querySelector('#disconnect').click()");
  await waitFor(async()=> (await text('#rc-badge')).includes('未接続'),'server disconnect');
  assert.ok(fixture.ops.includes('disconnect'));
  await send('Page.navigate',{url:fixture.base+'/ouchi-colon/?motor=1&transport=ble'});
  await waitFor(()=>evalPage("document.querySelector('#mode')?.value==='ble'"),'explicit BLE overrides Notif host default');
  await send('Page.navigate',{url:fixture.base+'/ouchi-colon/?motor=1&transport=notif'});
  await waitFor(()=>evalPage("document.querySelector('#mode')?.value==='notif'"),'return to Notif');
  console.log('Notif 1.9.0 HTTP UI passed with 400ms reads / 80ms writes: explicit selection, connect stopped, WASD release stop, 250/500/750/1500ms actions and repeated A01 without intermediate STOP, NVS read, legacy angle guard, disconnect, BLE selection and return to Notif. No real Bluetooth or motor.');
}finally{socket?.close();chrome.kill();await fixture.close();}
