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
  await send('Page.navigate',{url:'http://127.0.0.1:18181/ouchi-colon/?motor=1'});
  const $=selector=>'document.querySelector('+JSON.stringify(selector)+')';
  const text=selector=>evalPage($ (selector)+'.textContent');
  const click=selector=>evalPage($ (selector)+'.click()');
  const enabled=selector=>evalPage('!'+$ (selector)+'.disabled');

  await waitFor(()=>evalPage("document.querySelector('#rc-keyboard') !== null"),'motor UI');
  await waitFor(async()=> (await text('#usb-message')).includes('SHA-256'),'firmware prepared');
  const audit=async()=>{
    const visible=await evalPage('document.body.innerText');
    for(const old of ['1.5V','今の実測値を確認','制御を許可する','1回の操作を許可','Phase 6'])assert.ok(!visible.includes(old),old+' remains visible');
    assert.ok(visible.includes('電池3V'));assert.ok(visible.includes('100%'));
    assert.equal(await evalPage("document.querySelectorAll('.pattern-row:not(.pattern-hidden)').length"),10);
  };
  await audit();
  await click('#connect');
  await waitFor(()=>enabled('[data-motion="forward"]'),'direct mock ready');
  assert.match(await text('#left-state'),/0%/);
  assert.equal(await evalPage("document.querySelectorAll('[data-action]').length"),17);
  assert.equal(await evalPage("document.querySelector('[data-setting=pauseMs]').value"),'200');
  for(const [angle,ms] of [[15,2000],[30,4000],[45,6000],[90,12000]])for(const side of ['right','left'])assert.equal(await evalPage('document.querySelector('+JSON.stringify('button[data-id="'+side+angle+'"]')+').closest(".pattern-row").querySelector("input").value'),String(ms),'common initial duration '+side+angle);
  for(const id of ['right90','left90']){
    await evalPage('{const input=document.querySelector('+JSON.stringify('button[data-id="'+id+'"]')+').closest(".pattern-row").querySelector("input");input.value="1200";input.dispatchEvent(new Event("change"));}');
  }
  await waitFor(()=>enabled('#pattern-write'),'90 calibration writable');await click('#pattern-write');
  await waitFor(async()=> (await text('#pattern-message')).includes('10パターンを保存'),'saved 90 calibration');
  const key=(type,ch,autoRepeat=false)=>send('Input.dispatchKeyEvent',{type,key:ch,code:'Key'+ch.toUpperCase(),autoRepeat,windowsVirtualKeyCode:ch.toUpperCase().charCodeAt(0)});
  const sign=(s,d)=>s.includes(d>0?'正転 · 100%':'逆転 · 100%');
  for(const [ch,dir,left,right] of [['w','forward',1,1],['s','backward',-1,-1],['a','left',1,-1],['d','right',-1,1]]){
    await waitFor(()=>enabled('[data-motion="'+dir+'"]'),'direction available');
    await evalPage($ ('#rc-keyboard')+'.focus()');
    await key('keyDown',ch);
    await waitFor(async()=>sign(await text('#left-state'),left)&&sign(await text('#right-state'),right),'direct '+ch,2000);
    if(ch==='w'||ch==='s')assert.match(await text('.colon-actions [data-role=state]'),/出力指令中/,'A panel must not claim stopped during manual drive');
    await key('keyUp',ch);
    await waitFor(async()=> (await text('#left-state')).includes('0%')&&(await text('#right-state')).includes('0%'),'release stop');
  }
  await waitFor(()=>enabled('[data-motion="forward"]'),'ready for hold test');
  await key('keyDown','w');
  await waitFor(async()=>sign(await text('#left-state'),1),'hold started');
  await waitFor(async()=> (await text('#left-state')).includes('0%'),'max-time stop',1800);
  await key('keyDown','w',true);await sleep(200);
  assert.match(await text('#left-state'),/0%/,'held key must not restart');
  await key('keyUp','w');
  for(const [id,direction] of [['forward100','正転 · 100%'],['backward100','逆転 · 100%']]){
    const selector='button[data-id="'+id+'"]';
    await waitFor(()=>enabled(selector),'direct program ready '+id);
    await click(selector);
    await waitFor(async()=> (await text('#left-state')).includes(direction),'program full output '+id);
    await waitFor(async()=> (await text('#left-state')).includes('0%'),'program timed stop',2200);
  }
  const turn='button[data-id="right15"]';
  await waitFor(()=>enabled(turn),'default shared turn ready');
  await evalPage('{const input='+$(turn)+'.closest(".pattern-row").querySelector("input");input.value="300";input.dispatchEvent(new Event("change"));}');
  assert.equal(await evalPage('document.querySelector("button[data-id=left15]").closest(".pattern-row").querySelector("input").value'),'300','editing a right turn must update the shared left duration');
  await waitFor(()=>enabled('#pattern-write'),'calibration writable');
  await click('#pattern-write');
  await waitFor(async()=> (await text('#pattern-message')).includes('10パターンを保存'),'saved calibration');
  await waitFor(()=>enabled(turn),'calibrated turn');
  await click(turn);
  await waitFor(async()=>sign(await text('#left-state'),-1)&&sign(await text('#right-state'),1),'turn full duty');
  await waitFor(async()=> (await text('#left-state')).includes('0%'),'turn timed stop');
  await waitFor(()=>enabled('[data-motion="forward"]'),'ready for emergency');
  await evalPage($ ('#rc-keyboard')+'.focus()');
  await key('keyDown','w');await click('#emergency');
  await waitFor(async()=> (await text('#arm-badge')).includes('緊急停止'),'emergency latched');
  await key('keyUp','w');
  await waitFor(()=>enabled('#reset-estop'),'emergency reset ready');
  await click('#reset-estop');
  await waitFor(()=>enabled('[data-motion="forward"]'),'reset completed');
  await sleep(200);assert.match(await text('#left-state'),/0%/);
  await click('#disconnect');
  await waitFor(()=>enabled('#connect'),'disconnected');
  await click('#connect');await waitFor(()=>enabled('[data-motion="forward"]'),'reconnected');
  await sleep(200);assert.match(await text('#left-state'),/0%/);
  await audit();

  // Numbered multi-step actions and cancellation use the same UI in mock mode.
  for(const action of ['A08','A09','A10']){
    const selector='[data-action="'+action+'"]';
    await waitFor(()=>enabled(selector),'action ready '+action);await click(selector);
    await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes(action+' · 完了'),'action completed '+action,8000);
  }
  await click('[data-action="A09"]');
  await waitFor(async()=>sign(await text('#left-state'),-1),'cancel action started');
  await click('[data-action="A17"]');await sleep(1600);
  assert.match(await text('#left-state'),/0%/,'A17 must cancel pending forward leg');
  await evalPage('document.querySelector("[data-role=enabled]").click()');
  await click('#disconnect');await click('#connect');await waitFor(()=>enabled('[data-motion="forward"]'),'action reconnect ready');
  assert.equal(await evalPage('document.querySelector("[data-role=enabled]").checked'),false);

  await click('[data-role=mock-detected]');await sleep(250);
  assert.match(await text('[data-role=face]'),/モック入力/);
  // Fake BLE characteristics exercise the real BLE transport without requesting a device.
  await click('#disconnect');
  await evalPage('(async()=>{const {MockMotor}=await import("/ouchi-colon/src/motor/mock.ts");const {ACTION_PATTERN_IDS}=await import("/ouchi-colon/src/motor/patterns.ts");const core=new MockMotor(false,true);const start=performance.now();const now=()=>Math.floor(performance.now()-start);let disconnected=()=>{};const encode=x=>new DataView(new TextEncoder().encode(JSON.stringify(x)).buffer);setInterval(()=>core.tick(now()),5);const command={writeValueWithResponse:async data=>core.write(new Uint8Array(data),now())};const status={readValue:async()=>encode(core.status(now()))};const patterns={readValue:async()=>encode({version:6,slots:ACTION_PATTERN_IDS.map(id=>[core.patterns[id].speed,core.patterns[id].durationMs])})};const gatt={connected:false,connect:async()=>{gatt.connected=true;core.connect(now());return gatt;},disconnect:()=>{gatt.connected=false;core.disconnect(now());disconnected();},getPrimaryService:async()=>({getCharacteristic:async uuid=>uuid.includes("0002-")?command:uuid.includes("0003-")?status:patterns})};const device={gatt,addEventListener:(_name,fn)=>{disconnected=fn;}};Object.defineProperty(navigator,"bluetooth",{configurable:true,value:{requestDevice:async()=>device}});})()');
  await evalPage($ ('#mode')+'.value="ble";'+$ ('#mode')+'.dispatchEvent(new Event("change"));');
  await click('#connect');await waitFor(()=>enabled('[data-motion="forward"]'),'fake BLE direct ready');
  await audit();
  assert.equal(await evalPage('document.querySelector("[data-role=mock-detected]").checked'),false);
  assert.match(await text('[data-role=face]'),/未取得/,'mock gaze must not carry over to real BLE');
  await evalPage($ ('#rc-keyboard')+'.focus()');
  await key('keyDown','w');
  await waitFor(async()=>sign(await text('#left-state'),1),'fake BLE motion');
  await key('keyUp','w');
  await waitFor(async()=> (await text('#left-state')).includes('0%'),'fake BLE stop');
  await waitFor(()=>enabled('[data-action="A09"]'),'fake BLE action ready');await click('[data-action="A09"]');
  await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes('A09 · 完了'),'fake BLE action sequence');
  await sleep(150);
  const {writeFile}=await import('node:fs/promises');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await writeFile('work/direct-control-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evalPage('document.documentElement.scrollWidth<=innerWidth'),true,'mobile must fit width');
  await writeFile('work/direct-control-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await send('Page.navigate',{url:'http://127.0.0.1:18181/ouchi-colon/?debug=1&motorLink=1'});
  await waitFor(()=>evalPage('!!document.querySelector("#colon-motor-connect")'),'Colon same-page integration',20000);
  assert.equal(await evalPage('document.querySelectorAll("#colon-motor-link [data-action]").length'),17);
  await click('#colon-motor-connect');
  await waitFor(()=>enabled('[data-action="A09"]'),'Colon motor mock connected');
  await click('[data-action="A09"]');
  await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes('A09 · 完了'),'Colon action sequence');
  assert.equal(await evalPage('document.querySelector("[data-role=enabled]").checked'),false);
  await evalPage(`window.__arrivals=[];window.__speechTimers=[];Object.defineProperties(window.speechSynthesis,{getVoices:{configurable:true,value:()=>[]},cancel:{configurable:true,value:()=>{window.__speechTimers.forEach(clearTimeout);window.__speechTimers=[];}},speak:{configurable:true,value:u=>{window.__speechTimers.push(setTimeout(()=>{window.__arrivals.push(u.text);u.onstart?.(new Event('start'));window.__speechTimers.push(setTimeout(()=>u.onend?.(new Event('end')),30));},1));}}});`);
  await evalPage('document.querySelector("#tts-enabled").checked=true;document.querySelector("#reply-voice-engine").value="ios";document.querySelector("#reply-voice-engine").dispatchEvent(new Event("change"));');
  await evalPage('(async()=>{const b=await import("/ouchi-colon/src/motor/bridge.ts");window.__gazeTimer=setInterval(()=>b.publishMotorGaze(true,0,0.2),100);})()');
  await click('[data-role=enabled]');
  await sleep(150);
  await evalPage('document.querySelector("#conversation-input").value="こっちきて";document.querySelector("#conversation-input").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
  await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes('A07 · 完了'),'Colon conversation command reached motor and speech',7000).catch(async error=>{console.log(await evalPage('JSON.stringify({panel:document.querySelector("#colon-motor-link").innerText,arrivals:window.__arrivals,input:document.querySelector("#conversation-input").value})'));throw error;});
  assert.deepEqual(await evalPage('window.__arrivals'),['来たよ〜']);
  await click('[data-role=radio]');
  await evalPage('document.querySelector("#conversation-input").value="前";document.querySelector("#conversation-input").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
  await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes('A13 · 完了'),'Colon RC word command');
  await evalPage('document.querySelector("#conversation-input").value="前";document.querySelector("#conversation-input").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));document.querySelector("[data-action=A17]").click();');
  await sleep(700);
  assert.match(await text('.colon-actions [data-role=message]'),/A17 · 停止を要求/,'stop must cancel a queued voice command before its first motion');
  await click('[data-role=enabled]');
  await evalPage('clearInterval(window.__gazeTimer)');
  await click('[data-action="A07"]');
  await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes('A07 · 実行中'),'face loss action starts');
  await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes('顔'),'face loss abort',3000);
  await sleep(1500);assert.equal(await evalPage('window.__arrivals.length'),1,'face loss must not announce arrival');
  await click('[data-role=enabled]');
  assert.equal(await evalPage('document.querySelector("[data-role=enabled]").checked'),true);
  // Switching the link OFF must not disable the spoken STOP for a basic program.
  await click('[data-role=enabled]');
  await waitFor(()=>enabled('button[data-id=forward100]'),'basic program ready after link OFF');
  await click('button[data-id=forward100]');
  await waitFor(async()=> (await text('.colon-actions [data-role=state]')).includes('出力指令中'),'basic program state');
  await evalPage('document.querySelector("#conversation-input").value="止まれ";document.querySelector("#conversation-input").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
  await waitFor(async()=> (await text('.colon-actions [data-role=message]')).includes('A17 · 停止を要求'),'spoken stop is accepted even with link OFF');
  await click('#colon-motor-estop');
  assert.equal(await evalPage('document.querySelector("[data-role=enabled]").checked'),false);
  assert.equal(await evalPage('document.querySelector("[data-role=radio]").checked'),false);
  assert.equal(await evalPage('document.querySelectorAll("#colon-motor-link .pattern-row:not(.pattern-hidden)").length'),10);
  await writeFile('work/colon-actions-face.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  console.log('Direct UI: copy audit, mock and fake BLE, WASD, timed stop, held-key suppression, presets, calibration, A08/A09/A10, A17 cancellation, Colon typed command to A07/speech, face loss, queued command cancellation, spoken stop while link OFF, mock gaze isolation, state consistency, emergency reset, reconnection, and responsive layout passed');

}finally{socket?.close();chrome.kill();}
