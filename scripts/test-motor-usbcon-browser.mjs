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
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:'http://127.0.0.1:18181/ouchi-colon/usbcon.html'});
  await waitFor(()=>evalPage("!!document.querySelector('#pad-status')"),'USBcon loaded');
  assert.equal(await evalPage('document.title'),'ファーム1.8.0 USBcon');
  await evalPage("window.testPad={id:'SNES USB mock',index:0,connected:true,mapping:'',buttons:Array.from({length:10},()=>({pressed:false,value:0})),axes:[0,-1]};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.testPad?[window.testPad]:[]});document.querySelector('#connect').click();");
  const state=()=>evalPage("document.querySelector('#left-state').textContent");
  await waitFor(()=>evalPage("document.querySelector('#rc-badge').textContent.includes('停止中')"),'mock connected');await sleep(200);assert.match(await state(),/0%/,'held at connection cannot move');
  const neutral=async()=>{await evalPage('window.testPad.axes=[0,0];window.testPad.buttons.forEach(b=>{b.pressed=false;b.value=0;});');await sleep(200);};
  for(const [axis,value,left,right] of [[1,-1,'正転','正転'],[1,1,'逆転','逆転'],[0,-1,'正転','逆転'],[0,1,'逆転','正転']]){
    await neutral();await evalPage('window.testPad.axes['+axis+']='+value);
    await waitFor(async()=> (await state()).includes(left),'direction '+axis+value);
    assert.match(await evalPage("document.querySelector('#right-state').textContent"),new RegExp(right));
    await waitFor(async()=> (await state()).includes('0%'),'bounded stop');await sleep(250);assert.match(await state(),/0%/,'no held restart');
  }
  await neutral();await evalPage('window.testPad.axes[1]=-1');await waitFor(async()=> (await state()).includes('正転'),'before release');await neutral();await waitFor(async()=> (await state()).includes('0%'),'release stop');
  await evalPage('window.testPad.axes[1]=-1');await waitFor(async()=> (await state()).includes('正転'),'before unplug');await evalPage('window.testPad=null');await waitFor(async()=> (await state()).includes('0%'),'unplug stop');
  await evalPage("window.testPad={id:'SNES USB mock',index:0,connected:true,mapping:'',buttons:Array.from({length:10},()=>({pressed:false,value:0})),axes:[0,-1]};");await sleep(300);assert.match(await state(),/0%/,'reconnect cannot restart');
  await neutral();await evalPage('window.testPad.axes[1]=-1');await waitFor(async()=> (await state()).includes('正転'),'before face button');await evalPage('window.testPad.buttons[0]={pressed:true,value:1}');await waitFor(async()=> (await state()).includes('0%'),'button stop');
  await neutral();await evalPage("document.querySelector('#usbcon details').open=true;document.querySelector('[data-pad-direction=left]').click();");await sleep(120);await evalPage('window.testPad.buttons[2]={pressed:true,value:1}');await waitFor(()=>evalPage("document.querySelector('[data-pad-direction=left]').textContent.includes('b2')"),'learn button');await neutral();await evalPage('window.testPad.buttons[2]={pressed:true,value:1}');await waitFor(async()=> (await state()).includes('正転'),'learned left');assert.match(await evalPage("document.querySelector('#right-state').textContent"),/逆転/);await neutral();
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.ok(await evalPage('document.documentElement.scrollWidth<=innerWidth+1'),'mobile width');
  const {writeFile}=await import('node:fs/promises');await writeFile('work/usbcon-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log('USBcon UI passed: separate entry, neutral startup, four directions, 500ms limit, no held repeat, release, unplug, reconnect, face-button stop, learned mapping, mobile layout. Mock only; no real BLE or motor.');
}finally{socket?.close();chrome.kill();}
