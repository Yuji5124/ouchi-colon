import {PATTERN_IDS,PROGRAM_IDS,patternIds,fixedProgram,patternLabel,readLocalPatterns,validPattern,type PatternTable,type PatternId,type PatternConfig} from './patterns.ts';
import {COLON_EVENTS,COLON_MOTOR_CHANNEL,validColonEvent,type ColonEvent} from './bridge.ts';
import {OPS} from './protocol.ts';
import type {MotorSession} from './session.ts';
import './pattern-screen.css';
interface Hooks {session:()=>MotorSession|null;blocked:()=>string;stop:()=>void;say:(s:string)=>void;record:(event:string,error?:string,result?:string)=>void;}
export function mountPatternPanel(hooks:Hooks,parent:HTMLElement=document.querySelector('.motor-content')!){
  const section=document.createElement('section');section.className='motor-card pattern-panel';
  section.innerHTML=`<div class="section-top"><h2>動作パターン · Atomへ保存</h2><span class="badge"><span id="pattern-badge">No. 1〜8</span></span></div><p class="subtle">旋回角は時間で校正します。床・出力・電池条件をそろえて、実測した角度に合わせて時間を調整してください。旋回は50〜500ms、0msは未校正で実行できません。</p><div class="pattern-table" id="pattern-table"></div><div class="pattern-actions"><button id="pattern-local" class="motor-secondary">このPCに保存</button><button id="pattern-read" class="motor-secondary">Atomから読み込む</button><button id="pattern-write" class="motor-primary">Atomへパターンを書き込む</button></div><p id="pattern-message" class="motor-feedback" role="status">まずAtomの設定を読み込むか、パターンを書き込んでください。</p><details class="pattern-link"><summary>OuchiColonの表情・動作と連動する</summary><p class="subtle">同じブラウザ・同じURLの別タブでOuchiColonを開きます。表情変化に割り当てた動作を、明示許可1回につき1回だけ実行します。初期状態は連動OFF。非表示・切断・停止で待機許可を解除し、自動再許可しません。</p><div id="pattern-mappings" class="power-grid"></div><label class="check"><input id="pattern-link-enabled" type="checkbox"> 割当済みのイベントを、許可1回につき1動作へ連動</label><a href="?debug=1" target="_blank" rel="noopener">OuchiColonを別タブで開く ↗</a><p id="pattern-link-status" class="subtle">連動OFF</p></details>`;
  parent.prepend(section);
  const integrated=parent.id==='colon-motor-patterns';
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>section.querySelector<T>(`#${id}`)!;
  let table:PatternTable=readLocalPatterns(),busy=false,enabled=false,activity='';
  let verifiedSession:MotorSession|null=null;
  const mappings:Partial<Record<ColonEvent,PatternId>>={};const seen=new Set<string>();
  const message=(s:string)=>{el('pattern-message').textContent=s;hooks.say(s);};
  const displayIds:readonly PatternId[]=[...PROGRAM_IDS,...PATTERN_IDS.slice(0,6)];
  const activeIds=()=>patternIds(hooks.session()?.status?.patternsVersion??2);
  const fields=new Map<PatternId,{row:HTMLDivElement;label:HTMLElement;speed:HTMLSelectElement;duration:HTMLInputElement;run:HTMLButtonElement}>();
  displayIds.forEach(id=>{
    const row=document.createElement('div');row.className='pattern-row';
    const label=document.createElement('strong');
    const speed=document.createElement('select');speed.setAttribute('aria-label',`${patternLabel(id)}の出力`);for(const n of fixedProgram(id)?[100]:[25,50,75]){const o=new Option(`${n}%`,String(n));speed.append(o);}speed.value=String(table[id].speed);
    const duration=document.createElement('input');duration.type='number';duration.min='0';duration.max=fixedProgram(id)?'1000':'500';duration.step='1';duration.value=String(table[id].durationMs);duration.setAttribute('aria-label',`${patternLabel(id)}の時間ms`);
    const run=document.createElement('button');run.className='motor-secondary pattern-run';run.textContent='1回実行';run.dataset.id=id;
    const change=()=>{hooks.stop();table[id]={speed:Number(speed.value),durationMs:Number(duration.value)} as PatternConfig;verifiedSession=null;message('編集内容は未転送です。PC保存とAtomへの書込みは別操作です。');update();};
    speed.addEventListener('change',change);duration.addEventListener('change',change);run.addEventListener('click',()=>void runPattern(id));
    row.append(label,speed,duration,run);el('pattern-table').append(row);fields.set(id,{row,label,speed,duration,run});
  });
  function renderValues(){
    for(const [id,{speed,duration}] of fields){
      speed.value=String(table[id].speed);duration.value=String(table[id].durationMs);
    }
  }
  function allValid(){return activeIds().every(id=>validPattern(id,table[id]));}
  let renderedVersion:1|2|undefined;
  function update(){
    const session=hooks.session(),version=session?.status?.patternsVersion,supported=version===1||version===2;
    const shownVersion=version??2,ids=activeIds();
    if(renderedVersion!==shownVersion){
      renderedVersion=shownVersion;
      el('pattern-badge').textContent=shownVersion===2?'No. 1〜8 · 前後100%・1秒':'旧版 · 12パターン';
      for(const id of ids){
        const {row,label}=fields.get(id)!;
        label.textContent=(shownVersion===2?`No. ${ids.indexOf(id)+1}　`:'')+patternLabel(id);
        el('pattern-table').append(row);
      }
      for(const select of section.querySelectorAll<HTMLSelectElement>('#pattern-mappings select')){
        for(const option of select.options){
          if(!option.value)continue;
          const id=option.value as PatternId,index=ids.indexOf(id);
          option.disabled=option.hidden=index<0;
          option.textContent=(shownVersion===2&&index>=0?`No. ${index+1}　`:'')+patternLabel(id);
        }
        if(select.selectedOptions[0]?.disabled){
          select.value='';
          delete mappings[select.dataset.event as ColonEvent];
        }
      }
    }
    el<HTMLButtonElement>('pattern-read').disabled=busy||!session?.connected||!!session.foregroundBusy||!!session.status?.armed||!supported;
    el<HTMLButtonElement>('pattern-write').disabled=busy||!session?.connected||!!session.foregroundBusy||!!session.status?.armed||!supported||!allValid();
    el('pattern-read').textContent=activity==='read'?'読み込み中…':'Atomから読み込む';
    el('pattern-write').textContent=activity==='write'?'書込み中…':'Atomへパターンを書き込む';
    for(const [id,{row,speed,duration,run}] of fields){
      row.classList.toggle('pattern-hidden',!ids.includes(id));
      duration.disabled=busy||fixedProgram(id);
      speed.disabled=busy||id.startsWith('forward')||id.startsWith('backward');
      run.disabled=busy||!!session?.foregroundBusy||session?.status?.stopReason==='running'||!!session?.settings.singleTest||!!session?.status?.singleTest||!session?.status?.armed||!!hooks.blocked()||!supported||!validPattern(id,table[id])||table[id].durationMs===0||verifiedSession!==session;
    }
    el('pattern-link-status').textContent=integrated?(enabled?'連動ON · 明示許可を待機（1回で解除）':'連動OFF'):'顔画面への移動時に、この画面のBLE接続を終了します。';
  }
  el('pattern-local').addEventListener('click',()=>{if(!allValid()){message('時間は0（未校正）または50〜500ms、出力は25 / 50 / 75%にしてください。');return;}try{localStorage.setItem('colon-motor-patterns-v1',JSON.stringify(table));message('このブラウザに保存しました。Atomはまだ変更していません。');}catch{message('PCに保存できませんでした。保存設定を確認してください。');}});
  el('pattern-read').addEventListener('click',async()=>{const s=hooks.session();if(!s||s.status?.armed||busy)return;busy=true;activity='read';message('Atomのパターンを読み込んでいます。通信の完了を待っています…');update();try{const received=await s.readPatternTable();for(const id of patternIds(s.status?.patternsVersion))table[id]=received[id];verifiedSession=s;renderValues();message('Atomのパターンを読み込みました。角度は時間校正の目安です。');hooks.record('patterns-read');}catch(e){verifiedSession=null;message(String(e));}finally{busy=false;activity='';update();}});
  el('pattern-write').addEventListener('click',async()=>{
    const s=hooks.session();if(!s||s.status?.armed||busy||!allValid())return;busy=true;activity='write';update();
    const total=patternIds(s.status?.patternsVersion).length;
    try{await s.savePatternTable(table,count=>message(`パターンを書込み中 ${count}/${total}…`));verifiedSession=s;message(s.transport.kind==='mock'?`モック内に${total}パターンを保存・読戻し確認しました。`:`${total}パターンの保存と読戻しを確認しました。NVSに保持されます。`);hooks.record('patterns-saved',undefined,`source=${s.transport.kind}`);}
    catch(e){verifiedSession=null;message(`書込みが完了していません。一部保存の可能性があります。${String(e)}`);hooks.record('patterns-save-error',String(e));}finally{busy=false;activity='';update();}
  });
  async function runPattern(id:PatternId){
    const s=hooks.session();if(s?.settings.singleTest||s?.status?.singleTest){message('本体単独版ではパターンを実行できません。左右の単体ボタンを使用してください。');return;}if(!s||busy||!s.status?.armed||hooks.blocked()||verifiedSession!==s||!validPattern(id,table[id])||!table[id].durationMs){message('パターンの読込み / 書込み確認と、安全確認・1回の許可が必要です。旋回は校正時間も入力してください。');return;}
    const slot=patternIds(s.status.patternsVersion).indexOf(id);if(slot<0||document.hidden)return;
    busy=true;update();try{const current=await s.readPatternTable();if(JSON.stringify(current[id])!==JSON.stringify(table[id]))throw new Error('Atomの設定と編集値が違います。読み込み直してください。');if(s!==hooks.session()||!s.status?.armed||hooks.blocked()||document.hidden)throw new Error('駆動許可が解除されました。');await s.send(OPS.PATTERN,slot);hooks.record(`pattern:${id}`,undefined,JSON.stringify(table[id]));message(`${patternLabel(id)}を${table[id].durationMs}msの上限で実行要求しました。角度・距離は実測値ではありません。`);}catch(e){hooks.stop();message(String(e));}finally{busy=false;update();}
  }
  for(const event of COLON_EVENTS){const label=document.createElement('label');label.textContent=event;const select=document.createElement('select');select.dataset.event=event;select.setAttribute('aria-label',`${event}の連動パターン`);select.append(new Option('連動なし',''));for(const id of displayIds)select.append(new Option(patternLabel(id),id));select.addEventListener('change',()=>{hooks.stop();mappings[event]=(select.value||undefined) as PatternId|undefined;});label.append(select);el('pattern-mappings').append(label);}
  let channel:BroadcastChannel|null=null;
  try{if(typeof BroadcastChannel!=='undefined')channel=new BroadcastChannel(COLON_MOTOR_CHANNEL);}catch{/* Same-page events still work when channels are denied. */}
  el<HTMLInputElement>('pattern-link-enabled').disabled=!integrated;
  if(integrated){section.querySelector('.pattern-link .subtle')!.textContent='この顔画面内の表情変化を使います。割当・連動ON・安全確認の後に1回許可すると、次の対応イベントで1動作だけ実行します。非表示・切断・停止では許可を解除します。';section.querySelector<HTMLAnchorElement>('.pattern-link a')!.hidden=true;}
  else{section.querySelector('.pattern-link .subtle')!.textContent='連動は顔画面内の「OuchiColonモーター連動」パネルで設定します。下のリンクで移動後、実機BLEへ再接続し、Atomからパターンを読み込んで表情に割り当ててください。初期状態は連動OFFです。';el('pattern-mappings').hidden=true;el('pattern-link-enabled').closest('label')!.hidden=true;const faceLink=section.querySelector<HTMLAnchorElement>('.pattern-link a')!;faceLink.target='_self';faceLink.href='?debug=1&motorLink=1';faceLink.textContent='顔画面でモーター連動を設定する →';faceLink.addEventListener('click',()=>{hooks.stop();hooks.session()?.disconnect();});}
  el('pattern-link-enabled').addEventListener('change',()=>{hooks.stop();enabled=el<HTMLInputElement>('pattern-link-enabled').checked;seen.clear();update();});
  const onEvent=(value:unknown)=>{if(!enabled||document.hidden||!validColonEvent(value)||seen.has(value.id))return;seen.add(value.id);if(seen.size>100)seen.delete(seen.values().next().value!);const id=mappings[value.expression];if(id&&activeIds().includes(id)&&hooks.session()?.status?.armed){hooks.record(`colon-event:${value.expression}`);void runPattern(id);}};
  if(channel)channel.onmessage=event=>onEvent(event.data);
  window.addEventListener('colon-motor-expression',event=>onEvent((event as CustomEvent).detail));
  window.addEventListener('pagehide',()=>{channel?.close();enabled=false;});
  update();return {update};
}
