import './colon-link.css';
import {MotorSession} from './session.ts';
import {MockTransport,BleTransport} from './transport.ts';
import {OPS} from './protocol.ts';
import {mountPatternPanel} from './pattern-screen.ts';
/** Foreground face + motor controller in the same page. No connection until an explicit click. */
export function mountColonMotorLink(){
  const debug=document.querySelector('#debug');if(!debug)return;
  const root=document.createElement('section');root.id='colon-motor-link';root.innerHTML=`<details><summary>OuchiColonモーター連動（初期OFF）</summary><p>この顔画面内で表情変化をパターンへ連動できます。初期はモックです。1回の許可で1動作だけ。通電の適合確認は未完了です。</p><a href="?motor=1">USB書込み・Motor Test画面へ</a><label>接続<select id="colon-motor-mode"><option value="mock">モック（実機なし）</option><option value="ble">実機BLE（信号試験）</option></select></label><button id="colon-motor-connect" type="button">接続する</button><button id="colon-motor-disconnect" type="button" disabled>切断する</button><div class="colon-motor-safety"><label><input type="checkbox"> GPIO・MODE・GNDを確認</label><label><input type="checkbox"> VMとモーターを物理的に外した</label><label><input type="checkbox"> 物理遮断手段・周囲を確認</label><label><input type="checkbox"> 信号試験のみと理解した</label></div><button id="colon-motor-arm" type="button" disabled>信号連動を1回だけ許可</button><button id="colon-motor-estop" type="button">■ 緊急停止</button><button id="colon-motor-reset" type="button" disabled>緊急停止を解除（再許可は別）</button><p id="colon-motor-status" role="status">未接続・連動OFF</p><div id="colon-motor-patterns"></div></details>`;
  debug.append(root);
  const floatingStop=document.createElement('button');floatingStop.id='colon-motor-floating-stop';floatingStop.type='button';floatingStop.hidden=true;floatingStop.textContent='■ モーター緊急停止';document.body.append(floatingStop);
  const directions=document.createElement('div');directions.innerHTML='<label><input id="colon-motor-invert-left" type="checkbox"> 左の方向を反転</label><label><input id="colon-motor-invert-right" type="checkbox"> 右の方向を反転</label>';root.querySelector('.colon-motor-safety')!.after(directions);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>(`#${id}`)!;
  let session:MotorSession|null=null;
  const say=(s:string)=>{el('colon-motor-status').textContent=s;};
  const block=()=>!session?.connected?'接続してください。':session.status?.estop?'緊急停止中です。':!Array.from(root.querySelectorAll<HTMLInputElement>('.colon-motor-safety input')).every(i=>i.checked)?'安全条件4項目を確認してください。':'';
  const panel=mountPatternPanel({session:()=>session,blocked:block,stop:()=>session?.requestStop(),say,record:(e,error)=>say(error??e)},el('colon-motor-patterns'));
  function update(){const ready=!!session?.connected;floatingStop.hidden=!ready;floatingStop.textContent=`■ モーター緊急停止（${session?.transport.kind==='mock'?'モック':'実機BLE'}）`;el<HTMLButtonElement>('colon-motor-arm').disabled=!!block()||!!session?.status?.armed||!!session?.foregroundBusy;el<HTMLButtonElement>('colon-motor-connect').disabled=ready;el<HTMLSelectElement>('colon-motor-mode').disabled=ready;el<HTMLButtonElement>('colon-motor-disconnect').disabled=!ready;el<HTMLButtonElement>('colon-motor-reset').disabled=!session?.status?.estop;panel.update();}
  el('colon-motor-connect').addEventListener('click',async()=>{try{session=new MotorSession(el<HTMLSelectElement>('colon-motor-mode').value==='mock'?new MockTransport():new BleTransport());session.onStatus=update;session.onEvent=(event,error)=>{if(error||event==='disconnect'||event.startsWith('stopped:'))say(error??event);};await session.connect();say('接続しました。パターンを読み込み、割当と連動ON、安全確認後に1回だけ許可します。');}catch(e){say(String(e));session?.disconnect();}update();});
  el('colon-motor-arm').addEventListener('click',async()=>{if(block()||!session)return;try{session.settings.invertLeft=el<HTMLInputElement>('colon-motor-invert-left').checked;session.settings.invertRight=el<HTMLInputElement>('colon-motor-invert-right').checked;await session.arm();say('表情イベントに対して1回だけ許可しました。動作後は再許可が必要です。');}catch(e){say(String(e));}update();});
  const emergency=()=>{session?.requestStop(true);say('緊急停止要求。実機ではVMも物理遮断してください。');};
  el('colon-motor-estop').addEventListener('click',emergency);floatingStop.addEventListener('click',emergency);
  directions.querySelectorAll('input').forEach(i=>i.addEventListener('change',()=>session?.requestStop()));
  el('colon-motor-reset').addEventListener('click',()=>void session?.send(OPS.RESET_ESTOP).catch(e=>say(String(e))));
  el('colon-motor-disconnect').addEventListener('click',()=>{session?.requestStop();session?.disconnect();say('切断・実機停止は独立タイマーでも監視します。');update();});
  root.querySelectorAll<HTMLInputElement>('.colon-motor-safety input').forEach(i=>i.addEventListener('change',()=>{if(!i.checked)session?.requestStop();update();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)session?.requestStop();});window.addEventListener('pagehide',()=>{session?.requestStop();session?.disconnect();});window.addEventListener('blur',()=>session?.requestStop());
  setInterval(()=>void session?.poll(),150);setInterval(()=>{if(session?.connected&&!session.busy&&!document.hidden)void session.heartbeat().catch(e=>say(String(e)));},120);
  update();
  if(new URLSearchParams(location.search).get('motorLink')==='1'){root.querySelector('details')!.open=true;root.scrollIntoView({block:'start'});}
}
