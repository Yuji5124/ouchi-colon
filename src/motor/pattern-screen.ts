import {ACTION_PATTERN_IDS,patternLabel,fixedProgram,readLocalPatterns,patternStorageKey,validPattern,setSharedTurn,sharedTurnsMatch,type PatternTable,type PatternId,type PatternConfig} from './patterns.ts';
import {isCommonTimingFirmware} from './protocol.ts';
import type {MotorSession} from './session.ts';
import './pattern-screen.css';
interface Hooks {session:()=>MotorSession|null;blocked:()=>string;stop:()=>void;say:(s:string)=>void;record:(event:string,error?:string,result?:string)=>void;directControl?:boolean;occupied?:()=>boolean;}
export function mountPatternPanel(hooks:Hooks,parent:HTMLElement=document.querySelector('.motor-content')!){
  const section=document.createElement('section');section.className='motor-card pattern-panel';
  section.innerHTML=`<div class="section-top"><h2>基本動作・左右共通の旋回時間</h2><span id="pattern-badge" class="badge">No. 1〜10 · 出力100%</span></div>
    <p class="subtle">初期設定は左右共通で15°=2秒、30°=4秒、45°=6秒、90°=12秒です。同じ角度は片側を編集すると左右とも変わり、顔方向・言葉・ラジコン・番号付き動作に共通で使います。角度は時間による目安です。</p>
    <p id="pattern-connection" class="subtle"></p><div class="pattern-table" id="pattern-table"></div>
    <div class="pattern-actions"><button id="pattern-local" class="motor-secondary">このPCに保存</button><button id="pattern-read" class="motor-secondary">Atomから読み込む</button><button id="pattern-write" class="motor-primary">Atomへパターンを書き込む</button></div>
    <p id="pattern-message" class="motor-feedback" role="status">PC保存とAtomへの書込みは別操作です。共通時間を実機へ適用するには1.8.0へ更新してください。</p>
    <p class="pattern-link"><a href="?debug=1&motorLink=1">顔画面でColonと連動する →</a></p>`;
  parent.prepend(section);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>section.querySelector<T>(`#${id}`)!;
  let table:PatternTable=readLocalPatterns(6),busy=false,activity='';
  const message=(s:string)=>{el('pattern-message').textContent=s;hooks.say(s);};
  const fields=new Map<PatternId,{duration:HTMLInputElement;run:HTMLButtonElement}>();
  for(const [index,id] of ACTION_PATTERN_IDS.entries()){
    const row=document.createElement('div');row.className='pattern-row';
    const label=document.createElement('strong');label.textContent=`No. ${index+1}　${patternLabel(id)}`;
    const speed=document.createElement('select');speed.append(new Option('100%','100'));speed.disabled=true;speed.setAttribute('aria-label',`${patternLabel(id)}の出力`);
    const duration=document.createElement('input');duration.type='number';duration.min='0';duration.max=fixedProgram(id)?'1000':'12000';duration.step='1';duration.setAttribute('aria-label',`${patternLabel(id)}の時間ms`);
    const run=document.createElement('button');run.className='motor-secondary pattern-run';run.textContent='実行';run.dataset.id=id;
    duration.addEventListener('change',()=>{hooks.stop();setSharedTurn(table,id,{speed:100,durationMs:duration.valueAsNumber} as PatternConfig);renderValues();message('編集内容は未転送です。同じ角度の左右と、すべての角度指定動作に共通で反映します。Atomへ書き込んでください。');update();});
    run.addEventListener('click',()=>void runPattern(id));row.append(label,speed,duration,run);el('pattern-table').append(row);fields.set(id,{duration,run});
  }
  function renderValues(){for(const [id,field] of fields)field.duration.value=String(table[id].durationMs);}
  const allValid=()=>ACTION_PATTERN_IDS.every(id=>validPattern(id,table[id],6))&&sharedTurnsMatch(table);
  function update(){
    const s=hooks.session(),supported=isCommonTimingFirmware(s?.status),occupied=!!hooks.occupied?.(),moving=!!s?.status?.armed;
    el('pattern-connection').textContent=!s?.connected?'未接続 · 表示中の値はPC側の設定です。':!supported?'共通時間は未対応のファームです。USB欄から1.8.0へ更新してください。':'形式6 · Atomへの保存後、全角度指定動作で使用します。';
    el<HTMLButtonElement>('pattern-read').disabled=busy||occupied||!s?.connected||!!s.foregroundBusy||moving||!supported;
    el<HTMLButtonElement>('pattern-write').disabled=busy||occupied||!s?.connected||!!s.foregroundBusy||moving||!supported||!allValid();
    el('pattern-read').textContent=activity==='read'?'読み込み中…':'Atomから読み込む';el('pattern-write').textContent=activity==='write'?'書込み中…':'Atomへパターンを書き込む';
    for(const [id,{duration,run}] of fields){duration.disabled=busy||occupied||moving||fixedProgram(id);run.disabled=busy||occupied||!!s?.foregroundBusy||moving||!s?.connected||!supported||!!hooks.blocked()||!allValid()||!table[id].durationMs;}
  }
  el('pattern-local').addEventListener('click',()=>{if(!allValid()){message('旋回時間は0（未設定）または50〜12000msです。同じ角度の左右をそろえてください。');return;}try{localStorage.setItem(patternStorageKey(6),JSON.stringify(Object.fromEntries(ACTION_PATTERN_IDS.map(id=>[id,table[id]]))));message('このブラウザに保存しました。Atomはまだ変更していません。');}catch{message('PCに保存できませんでした。');}});
  el('pattern-read').addEventListener('click',async()=>{const s=hooks.session();if(!s?.connected||!isCommonTimingFirmware(s.status)||busy||hooks.occupied?.()||s.status?.armed)return;busy=true;activity='read';update();try{table=await s.readPatternTable();renderValues();message('Atomの共通時間を読み込みました。');hooks.record('patterns-read');}catch(error){message(String(error));}finally{busy=false;activity='';update();}});
  el('pattern-write').addEventListener('click',async()=>{const s=hooks.session();if(!s?.connected||!isCommonTimingFirmware(s.status)||busy||hooks.occupied?.()||s.status?.armed||!allValid())return;busy=true;activity='write';update();try{table=await s.savePatternTable(table,count=>message(`共通時間を書込み中 ${count}/10…`));renderValues();message(s.transport.kind==='mock'?'モック内に10パターンを保存・読戻し確認しました。':'10パターンの共通時間をNVSに保存・読戻し確認しました。');hooks.record('patterns-saved');}catch(error){message('保存を完了できませんでした。Atomから読み込んで確認してください。'+String(error));hooks.record('patterns-save-error',String(error));}finally{busy=false;activity='';update();}});
  async function runPattern(id:PatternId){const s=hooks.session();if(!s||busy||hooks.occupied?.()||hooks.blocked()||!isCommonTimingFirmware(s.status))return;busy=true;update();try{await s.runProgram(id,table[id]);hooks.record(`program:${id}`,undefined,JSON.stringify(table[id]));message(`${patternLabel(id)}を${table[id].durationMs}msの指令時間で開始しました。`);}catch(error){hooks.stop();message(String(error));}finally{busy=false;update();}}
  const link=section.querySelector<HTMLAnchorElement>('a')!;if(parent.id==='colon-motor-patterns')link.parentElement!.hidden=true;else link.addEventListener('click',()=>{hooks.stop();hooks.session()?.disconnect();});
  renderValues();update();return {update};
}
