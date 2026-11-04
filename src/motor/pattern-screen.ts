import {PATTERN_IDS,patternLabel,readLocalPatterns,validPattern,type PatternTable,type PatternId,type PatternConfig} from './patterns.ts';
import {COLON_EVENTS,COLON_MOTOR_CHANNEL,validColonEvent,type ColonEvent} from './bridge.ts';
import {OPS} from './protocol.ts';
import type {MotorSession} from './session.ts';
interface Hooks {session:()=>MotorSession|null;blocked:()=>string;stop:()=>void;say:(s:string)=>void;record:(event:string,error?:string,result?:string)=>void;}
export function mountPatternPanel(hooks:Hooks,parent:HTMLElement=document.querySelector('.motor-content')!){
  const section=document.createElement('section');section.className='motor-card pattern-panel';
  section.innerHTML=`<div class="section-top"><h2>動作パターン · Atomへ保存</h2><span class="badge">前後25 / 50 / 75% ＋ 左右15 / 30 / 45°</span></div><p class="subtle">旋回は角度センサーで止める機能ではありません。実際の床・出力・電池条件で時間を校正した「目安」です。未校正0msは実行禁止。全パターンに500msの上限を維持します。</p><div class="pattern-table" id="pattern-table"></div><div class="pattern-actions"><button id="pattern-local" class="motor-secondary">このPCに保存</button><button id="pattern-read" class="motor-secondary">Atomから読み込む</button><button id="pattern-write" class="motor-primary">Atomへパターンを書き込む</button></div><p id="pattern-message" class="motor-feedback" role="status">前後は200msの短いパルス。旋回時間は未校正です。</p><details class="pattern-link"><summary>OuchiColonの表情・動作と連動する</summary><p class="subtle">同じブラウザ・同じURLの別タブでOuchiColonを開きます。表情変化に割り当てた動作を、明示許可1回につき1回だけ実行します。初期状態は連動OFF。非表示・切断・停止で待機許可を解除し、自動再許可しません。</p><div id="pattern-mappings" class="power-grid"></div><label class="check"><input id="pattern-link-enabled" type="checkbox"> 割当済みのイベントを、許可1回につき1動作へ連動</label><a href="?debug=1" target="_blank" rel="noopener">OuchiColonを別タブで開く ↗</a><p id="pattern-link-status" class="subtle">連動OFF</p></details>`;
  parent.prepend(section);
  const integrated=parent.id==='colon-motor-patterns';
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>section.querySelector<T>(`#${id}`)!;
  let table:PatternTable=readLocalPatterns(),busy=false,enabled=false;
  let verifiedSession:MotorSession|null=null;
  const mappings:Partial<Record<ColonEvent,PatternId>>={};const seen=new Set<string>();
  const message=(s:string)=>{el('pattern-message').textContent=s;hooks.say(s);};
  PATTERN_IDS.forEach(id=>{
    const row=document.createElement('div');row.className='pattern-row';
    const label=document.createElement('strong');label.textContent=patternLabel(id);
    const speed=document.createElement('select');speed.setAttribute('aria-label',`${patternLabel(id)}の出力`);for(const n of [25,50,75]){const o=new Option(`${n}%`,String(n));speed.append(o);}speed.value=String(table[id].speed);speed.disabled=PATTERN_IDS.indexOf(id)<6;
    const duration=document.createElement('input');duration.type='number';duration.min='0';duration.max='500';duration.step='1';duration.value=String(table[id].durationMs);duration.setAttribute('aria-label',`${patternLabel(id)}の時間ms`);
    const run=document.createElement('button');run.className='motor-secondary pattern-run';run.textContent='1回実行';run.dataset.id=id;
    const change=()=>{hooks.stop();table[id]={speed:Number(speed.value),durationMs:Number(duration.value)} as PatternConfig;verifiedSession=null;message('編集内容は未転送です。PC保存とAtomへの書込みは別操作です。');update();};
    speed.addEventListener('change',change);duration.addEventListener('change',change);run.addEventListener('click',()=>void runPattern(id));
    row.append(label,speed,duration,run);el('pattern-table').append(row);
  });
  function renderValues(){PATTERN_IDS.forEach((id,i)=>{const row=el('pattern-table').children[i];(row.querySelector('select') as HTMLSelectElement).value=String(table[id].speed);(row.querySelector('input') as HTMLInputElement).value=String(table[id].durationMs);});}
  function allValid(){return PATTERN_IDS.every(id=>validPattern(id,table[id]));}
  function update(){
    const session=hooks.session(),supported=session?.status?.patternsVersion===1;
    el<HTMLButtonElement>('pattern-read').disabled=busy||!session?.connected||!!session.busy||!!session.status?.armed||!supported;
    el<HTMLButtonElement>('pattern-write').disabled=busy||!session?.connected||!!session.busy||!!session.status?.armed||!supported||!allValid();
    section.querySelectorAll<HTMLButtonElement>('.pattern-run').forEach(b=>{const id=b.dataset.id as PatternId;b.disabled=busy||!session?.status?.armed||!!hooks.blocked()||!supported||!validPattern(id,table[id])||table[id].durationMs===0||verifiedSession!==session;});
    el('pattern-link-status').textContent=enabled?'連動ON · 明示許可を待機（1回で解除）':'連動OFF';
  }
  el('pattern-local').addEventListener('click',()=>{if(!allValid()){message('時間は0（未校正）または50〜500ms、出力は25 / 50 / 75%にしてください。');return;}try{localStorage.setItem('colon-motor-patterns-v1',JSON.stringify(table));message('このブラウザに保存しました。Atomはまだ変更していません。');}catch{message('PCに保存できませんでした。保存設定を確認してください。');}});
  el('pattern-read').addEventListener('click',async()=>{const s=hooks.session();if(!s||s.status?.armed||busy)return;busy=true;update();try{table=await s.readPatternTable();verifiedSession=s;renderValues();message('Atomのパターンを読み込みました。角度は時間校正の目安です。');hooks.record('patterns-read');}catch(e){message(String(e));}finally{busy=false;update();}});
  el('pattern-write').addEventListener('click',async()=>{
    const s=hooks.session();if(!s||s.status?.armed||busy||!allValid())return;busy=true;update();
    try{for(let i=0;i<PATTERN_IDS.length;i++){const id=PATTERN_IDS[i],p=table[id];await s.send(OPS.SAVE_PATTERN,i,p.speed,p.durationMs);message(`パターンを書込み中 ${i+1}/12…`);}const readback=await s.readPatternTable();if(JSON.stringify(readback)!==JSON.stringify(table))throw new Error('読戻しが一致しません。Atomから読み込んで確認してください。');verifiedSession=s;message(s.transport.kind==='mock'?'モック内に12パターンを保存・読戻し確認しました。実機は変更していません。':'12パターンの保存と読戻しを確認しました。NVSに保持されます。');hooks.record('patterns-saved',undefined,`source=${s.transport.kind}`);}
    catch(e){verifiedSession=null;message(`書込みが完了していません。一部保存の可能性があります。${String(e)}`);hooks.record('patterns-save-error',String(e));}finally{busy=false;update();}
  });
  async function runPattern(id:PatternId){
    const s=hooks.session();if(!s||busy||!s.status?.armed||hooks.blocked()||verifiedSession!==s||!validPattern(id,table[id])||!table[id].durationMs){message('パターンの読込み / 書込み確認と、安全確認・1回の許可が必要です。旋回は校正時間も入力してください。');return;}
    busy=true;update();try{const current=await s.readPatternTable();if(JSON.stringify(current[id])!==JSON.stringify(table[id]))throw new Error('Atomの設定と編集値が違います。読み込み直してください。');await s.send(OPS.PATTERN,PATTERN_IDS.indexOf(id));hooks.record(`pattern:${id}`,undefined,JSON.stringify(table[id]));message(`${patternLabel(id)}を${table[id].durationMs}msの上限で実行要求しました。角度・距離は実測値ではありません。`);}catch(e){hooks.stop();message(String(e));}finally{busy=false;update();}
  }
  for(const event of COLON_EVENTS){const label=document.createElement('label');label.textContent=event;const select=document.createElement('select');select.setAttribute('aria-label',`${event}の連動パターン`);select.append(new Option('連動なし',''));for(const id of PATTERN_IDS)select.append(new Option(patternLabel(id),id));select.addEventListener('change',()=>{hooks.stop();mappings[event]=(select.value||undefined) as PatternId|undefined;});label.append(select);el('pattern-mappings').append(label);}
  let channel:BroadcastChannel|null=null;
  try{if(typeof BroadcastChannel!=='undefined')channel=new BroadcastChannel(COLON_MOTOR_CHANNEL);}catch{/* Same-page events still work when channels are denied. */}
  el<HTMLInputElement>('pattern-link-enabled').disabled=!integrated;
  if(integrated){section.querySelector('.pattern-link .subtle')!.textContent='この顔画面内の表情変化を使います。割当・連動ON・安全確認の後に1回許可すると、次の対応イベントで1動作だけ実行します。非表示・切断・停止では許可を解除します。';section.querySelector<HTMLAnchorElement>('.pattern-link a')!.hidden=true;}
  else{section.querySelector('.pattern-link .subtle')!.textContent='連動はOuchiColonの顔画面内に追加した「モーター連動」パネルで接続・設定してください。この独立テスト画面は非表示になると停止します。下のリンクから顔画面を開けます。';el('pattern-mappings').hidden=true;el('pattern-link-enabled').closest('label')!.hidden=true;}
  el('pattern-link-enabled').addEventListener('change',()=>{hooks.stop();enabled=el<HTMLInputElement>('pattern-link-enabled').checked;seen.clear();update();});
  const onEvent=(value:unknown)=>{if(!enabled||document.hidden||!validColonEvent(value)||seen.has(value.id))return;seen.add(value.id);if(seen.size>100)seen.delete(seen.values().next().value!);const id=mappings[value.expression];if(id&&hooks.session()?.status?.armed){hooks.record(`colon-event:${value.expression}`);void runPattern(id);}};
  if(channel)channel.onmessage=event=>onEvent(event.data);
  window.addEventListener('colon-motor-expression',event=>onEvent((event as CustomEvent).detail));
  window.addEventListener('pagehide',()=>{channel?.close();enabled=false;});
  update();return {update};
}
