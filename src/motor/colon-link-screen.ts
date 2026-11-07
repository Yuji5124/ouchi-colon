import './colon-link.css';
import {MotorSession} from './session.ts';
import {MockTransport,BleTransport} from './transport.ts';
import {OPS,INITIAL_SETTINGS,isActionFirmware} from './protocol.ts';
import {mountPatternPanel} from './pattern-screen.ts';
import {mountActionPanel} from './actions-screen.ts';
/** Face, conversation and motor actions share one foreground connection. */
export function mountColonMotorLink(){
  const debug=document.querySelector('#debug');if(!debug)return;
  const root=document.createElement('section');root.id='colon-motor-link';
  root.innerHTML=`<details><summary>OuchiColon · モーター動作 A01〜A17</summary>
    <p>電池3V・出力100%・時間制御。接続するだけでは動きません。</p>
    <a href="?motor=1">ラジコン操作・USB書込みへ</a>
    <label>接続先<select id="colon-motor-mode"><option value="mock">モック（実機なし）</option><option value="ble">AtomS3 · Bluetooth</option></select></label>
    <button id="colon-motor-connect" type="button">接続する</button><button id="colon-motor-disconnect" type="button" disabled>切断する</button>
    <button id="colon-motor-estop" type="button">■ 緊急停止</button><button id="colon-motor-reset" type="button" hidden>緊急停止を解除</button>
    <p id="colon-motor-status" role="status">未接続・連動OFF</p>
    <details><summary>モーターの方向設定</summary><label><input id="colon-motor-invert-left" type="checkbox"> A出力を反転</label><label><input id="colon-motor-invert-right" type="checkbox"> B出力を反転</label></details>
    <div id="colon-motor-actions"></div><div id="colon-motor-patterns"></div></details>`;
  debug.append(root);
  const floatingStop=document.createElement('button');floatingStop.id='colon-motor-floating-stop';floatingStop.type='button';floatingStop.hidden=true;floatingStop.textContent='■ モーター緊急停止';document.body.append(floatingStop);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>(`#${id}`)!;
  let session:MotorSession|null=null,connecting=false,heartbeatBusy=false;
  let actions:ReturnType<typeof mountActionPanel>|null=null,patterns:ReturnType<typeof mountPatternPanel>|null=null;
  const say=(text:string)=>{el('colon-motor-status').textContent=text;};
  const block=()=>!session?.connected?'AtomS3へ接続してください。':!isActionFirmware(session.status)?'走行プログラム1.7.0へ更新してください。':session.status?.estop?'緊急停止中です。':!session.status?.gpioReady?'本体の初期化を待っています。':'';
  function stop(emergency=false){if(actions)actions.stop(emergency);else session?.requestStop(emergency);}
  function update(){
    const connected=!!session?.connected;floatingStop.hidden=!connected;floatingStop.textContent=`■ モーター緊急停止（${session?.transport.kind==='mock'?'モック':'実機BLE'}）`;
    el<HTMLButtonElement>('colon-motor-connect').disabled=connected||connecting;el<HTMLSelectElement>('colon-motor-mode').disabled=connected||connecting;
    el<HTMLButtonElement>('colon-motor-disconnect').disabled=!connected;el('colon-motor-reset').hidden=!session?.status?.estop;
    for(const id of ['colon-motor-invert-left','colon-motor-invert-right'])el<HTMLInputElement>(id).disabled=!!actions?.running||!!session?.status?.armed;
    actions?.update();patterns?.update();
  }
  actions=mountActionPanel({session:()=>session,blocked:block,manualMs:()=>500,say,record:(event,error)=>{if(error)say(error);else if(event.startsWith('action-'))say(event);},changed:update,integrated:true},el('colon-motor-actions'));
  patterns=mountPatternPanel({session:()=>session,blocked:block,occupied:()=>!!actions?.running,stop,say,record:(event,error)=>say(error??event),directControl:true},el('colon-motor-patterns'));
  el('colon-motor-connect').addEventListener('click',async()=>{
    if(connecting||session?.connected)return;connecting=true;update();
    const next=new MotorSession(el<HTMLSelectElement>('colon-motor-mode').value==='mock'?new MockTransport(false,true):new BleTransport());session=next;
    next.settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
    next.onStatus=update;next.onEvent=(event,error)=>{if(error||event==='disconnect')say(error??'切断しました。連動はOFFです。');};
    try{await next.connect();say(block()||`${next.status?.firmware} · 接続しました。連動はOFFです。`);}catch(error){next.disconnect();say(String(error));}
    finally{connecting=false;update();}
  });
  const emergency=()=>{stop(true);say('緊急停止を要求しました。続きと連動を取り消しました。');};
  el('colon-motor-estop').addEventListener('click',emergency);floatingStop.addEventListener('click',emergency);
  for(const id of ['colon-motor-invert-left','colon-motor-invert-right'])el(id).addEventListener('change',()=>{
    stop();if(session){session.settings.invertLeft=el<HTMLInputElement>('colon-motor-invert-left').checked;session.settings.invertRight=el<HTMLInputElement>('colon-motor-invert-right').checked;}update();
  });
  el('colon-motor-reset').addEventListener('click',async()=>{try{await session?.send(OPS.RESET_ESTOP);say('緊急停止を解除しました。連動はOFFのままです。');}catch(error){say(String(error));}update();});
  el('colon-motor-disconnect').addEventListener('click',()=>{stop();session?.disconnect();say('切断しました。');update();});
  root.querySelector<HTMLAnchorElement>('a')!.addEventListener('click',()=>{stop();session?.disconnect();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('blur',()=>stop());window.addEventListener('pagehide',()=>{stop();session?.disconnect();});
  setInterval(()=>void session?.poll(),150);
  setInterval(async()=>{if(heartbeatBusy||!session?.connected||session.busy||document.hidden)return;heartbeatBusy=true;try{await session.heartbeat();}catch(error){say(String(error));}finally{heartbeatBusy=false;}},120);
  update();
  if(new URLSearchParams(location.search).get('motorLink')==='1'){root.querySelector('details')!.open=true;root.scrollIntoView({block:'start'});}
}
