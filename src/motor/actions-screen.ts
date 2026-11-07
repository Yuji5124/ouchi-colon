import './actions-screen.css';
import {ACTIONS,DEFAULT_ACTION_SETTINGS,actionForCommand,faceAction,freshFace,validActionSettings,type ActionId,type ActionSettings,type FacePose} from './actions.ts';
import {ActionRunner} from './action-runner.ts';
import {getMotorSpeaker,registerMotorActionHandler,subscribeMotorSignals} from './bridge.ts';
import {isActionFirmware} from './protocol.ts';
import {SpeechSynthesisEngine} from '../speech/speech-synthesis-engine.ts';
import type {MotorSession} from './session.ts';

interface Hooks {
  session:()=>MotorSession|null; blocked:()=>string; manualMs:()=>number;
  say:(message:string)=>void; record:(event:string,error?:string,result?:string)=>void;
  changed:()=>void; integrated?:boolean;
}
export function mountActionPanel(hooks:Hooks,parent:HTMLElement){
  const root=document.createElement('section');root.className='motor-card colon-actions';
  root.innerHTML=`<div class="section-top"><h2>Colonの動作 · A01〜A17</h2><span class="badge" data-role="state">停止中</span></div>
    <p>出力100%・時間制御。番号を使ってColonの言葉や表情に結び付けます。各動作は停止まで確認してから次へ進みます。</p>
    <p data-role="message" class="motor-feedback" role="status">ファーム1.7.0に接続すると試せます。</p>
    <div class="colon-action-grid"></div>
    <div class="colon-action-link"><h3>Colonと連動</h3>
      <label class="check"><input data-role="enabled" type="checkbox"> 言葉・うれしい・よくわからないを連動する</label>
      <label class="check"><input data-role="radio" type="checkbox"> ラジコンの言葉も使う（前・後ろ・左・右）</label>
      <label class="check"><input data-role="follow" type="checkbox"> 顔の方向へ自動で向く（A01〜A06）</label>
      <p class="subtle">初期OFF。停止・画面切替・切断でOFFになります。音声指示は顔画面の既存マイクを開始してください。「こっちきて」「右向いて」「左向いて」「止まれ」に対応します。</p>
      <form data-role="command-form"><label>言葉で試す<input data-role="command" placeholder="右向いて" autocomplete="off"></label><button type="submit" class="motor-secondary">実行</button></form>
      <p data-role="face" class="subtle">顔の位置：未取得</p>
    </div>
    <details><summary>時間・顔方向の設定</summary><div class="action-settings">
      <label>A10の停止間隔（ms）<input data-setting="pauseMs" type="number" min="100" max="2000" step="10"></label>
      <label>うれしい時の動作<select data-setting="happy"><option value="A08">A08 · 左1秒 → 右1秒</option><option value="A09">A09 · 後ろ1秒 → 前1秒</option></select></label>
      <label>正面とする範囲<input data-setting="deadZone" type="number" min="0.02" max="0.98" step="0.01"></label>
      <label>30°にする境界<input data-setting="medium" type="number" min="0.03" max="0.99" step="0.01"></label>
      <label>45°にする境界<input data-setting="large" type="number" min="0.04" max="1" step="0.01"></label>
    </div><p class="subtle">左右のずれは0〜1。見かけの顔サイズが小さいと旋回を大きめに、大きいと小さめに選びます。実距離の測定や角度センサーはありません。旋回時間は下の「動作パターン」で校正・Atomへ保存してください。</p>
    <button data-role="export" class="motor-secondary">動作一覧をJSONで保存</button></details>
    <details data-role="mock-face"><summary>モック専用 · 顔の位置を試す</summary><label>左右の位置（左−1 / 右+1）<input data-role="mock-x" type="range" min="-1" max="1" step="0.01" value="0"></label><label>見かけの顔幅<input data-role="mock-size" type="number" min="0.01" max="1" step="0.01" value="0.2"></label><label class="check"><input data-role="mock-detected" type="checkbox"> 仮の顔を検出中にする</label><p class="subtle">実機接続では利用できません。カメラの測定値ではありません。</p></details>`;
  parent.append(root);
  const el=<T extends HTMLElement=HTMLElement>(role:string)=>root.querySelector<T>(`[data-role="${role}"]`)!;
  let settings={...DEFAULT_ACTION_SETTINGS},pose:FacePose|null=null;
  try{const value=JSON.parse(localStorage.getItem('colon-actions-v1')??'null');if(validActionSettings(value))settings=value;}catch{}
  for(const key of Object.keys(settings) as Array<keyof ActionSettings>)root.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-setting="${key}"]`)!.value=String(settings[key]);
  let enabled=false,follow=false,radio=false,lastAutomatic=0,candidate:ActionId|null=null,stable=0;
  let previousConnected=false,previousBoot:number|undefined;
  const speech=new SpeechSynthesisEngine();
  const message=(text:string)=>{el('message').textContent=text;hooks.say(text);};
  const speaker=()=>getMotorSpeaker();
  const runner=new ActionRunner({session:hooks.session,face:()=>pose,
    speechReady:()=>speaker()?.ready()??(!speech.isSupported?'このブラウザでは到着の読み上げを利用できません。':''),
    speak:async(text,signal)=>{
      const selected=speaker();if(selected){await selected.speak(text,signal);return;}
      const abort=()=>speech.stop(),timer=setTimeout(abort,20000);
      signal.addEventListener('abort',abort,{once:true});
      try{if(signal.aborted)throw new Error('停止しました。');if(!await speech.speak(text))throw new Error('到着の読み上げを完了できませんでした。');}
      finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
    },changed:()=>{update();hooks.changed();},
  });
  function block(){return hooks.blocked()||(!isActionFirmware(hooks.session()?.status)?'A01〜A17には走行プログラム1.7.0を書き込んでください。':'');}
  function occupied(){const session=hooks.session();return runner.running||!!session?.foregroundBusy||!!session?.status?.armed;}
  function disableAutomatic(){enabled=follow=radio=false;candidate=null;stable=0;for(const role of ['enabled','follow','radio'])el<HTMLInputElement>(role).checked=false;}
  function stop(emergency=false){disableAutomatic();runner.stop(emergency);update();}
  async function run(id:ActionId){
    if(id==='A17'){stop();message('A17 · 停止しました。続きの動作と連動も取り消しました。');hooks.record('action:A17');return true;}
    const blocked=block();if(blocked){message(blocked);return false;}
    if(occupied()){message('動作または通信処理中です。停止後にもう一度実行してください。');return false;}
    try{
      message(`${id} · 実行中`);hooks.record(`action-start:${id}`);
      await runner.run(id,settings,hooks.manualMs());
      message(`${id} · 完了（モーター停止指令を確認）`);hooks.record(`action-complete:${id}`);return true;
    }catch(error){disableAutomatic();message(`${id} · ${String(error)}`);hooks.record(`action-error:${id}`,String(error));return false;}
    finally{lastAutomatic=Date.now();update();}
  }
  const buttons=new Map<ActionId,HTMLButtonElement>();
  for(const action of ACTIONS){
    const button=document.createElement('button');button.type='button';button.className='colon-action-button';button.dataset.action=action.id;
    const title=document.createElement('strong'),description=document.createElement('small');title.textContent=`${action.id}　${action.label}`;description.textContent=action.description;
    button.append(title,description);if(action.id==='A17')button.classList.add('action-stop');
    button.addEventListener('click',()=>void run(action.id));buttons.set(action.id,button);root.querySelector('.colon-action-grid')!.append(button);
  }
  function update(){
    const session=hooks.session(),connected=!!session?.connected,boot=session?.status?.bootId;
    if(previousConnected&&(!connected||boot!==previousBoot)){disableAutomatic();runner.stop();}
    previousConnected=connected;previousBoot=boot;
    const blocked=block(),moving=!!session?.status&&(!!session.status.left||!!session.status.right||session.status.armed);
    el('state').textContent=runner.running?`${runner.active} · ${runner.step}/${runner.total}`:!connected?'未接続':blocked?'更新・停止状態を確認':'停止中';
    for(const [id,button] of buttons){button.disabled=id!=='A17'&&(!!blocked||runner.running||!!session?.foregroundBusy||moving);button.classList.toggle('is-active',runner.active===id);}
    for(const role of ['enabled','follow','radio'])el<HTMLInputElement>(role).disabled=!!blocked;
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setting]').forEach(input=>input.disabled=runner.running);
    el('mock-face').hidden=session?.transport.kind!=='mock'||!!hooks.integrated;
    el('face').textContent=freshFace(pose)?`顔の位置：${pose.x<0?'左':'右'} ${Math.abs(pose.x).toFixed(2)} / 見かけの幅 ${pose.size?.toFixed(2)??'未取得'} / ${session?.transport.kind==='mock'&&!hooks.integrated&&el<HTMLInputElement>('mock-detected').checked?'モック入力':'顔検出入力'}`:'顔の位置：未取得・消失または更新なし';
  }
  function receivePose(next:FacePose){
      pose=next;
      if(follow&&freshFace(pose)&&!document.hidden&&!occupied()&&!block()){
        const selected=faceAction(pose,settings);stable=selected===candidate?stable+1:1;candidate=selected;
        if(selected&&stable>=3&&Date.now()-lastAutomatic>=2000){lastAutomatic=Date.now();stable=0;void run(selected);}
      }else{candidate=null;stable=0;}
  }
  const unsubscribe=subscribeMotorSignals(event=>{
    if(event.type==='colon-motor-gaze')receivePose(event.pose);
    else if(enabled&&!document.hidden&&!occupied()&&!block()&&Date.now()-lastAutomatic>=2000){
      const id=event.type==='colon-motor-unknown'?'A10':event.expression==='HAPPY'?settings.happy:null;
      if(id){lastAutomatic=Date.now();void run(id);}
    }
    update();
  });
  const unregister=hooks.integrated?registerMotorActionHandler((id,completed)=>{
    if(id!=='A17'&&!enabled)return false;
    if(['A13','A14','A15','A16'].includes(id)&&!radio)return false;
    if(id==='A17'&&!enabled&&!follow&&!runner.running)return false;
    void Promise.resolve().then(()=>run(id)).then(success=>completed?.(success));return true;
  }):()=>{};
  for(const role of ['enabled','follow','radio'])el(role).addEventListener('change',()=>{
    enabled=el<HTMLInputElement>('enabled').checked;follow=el<HTMLInputElement>('follow').checked;
    radio=el<HTMLInputElement>('radio').checked;
    if(role==='radio'&&radio){enabled=true;el<HTMLInputElement>('enabled').checked=true;}
    if(!enabled){radio=false;el<HTMLInputElement>('radio').checked=false;}
    if(block()){disableAutomatic();message(block());}else message(`言葉・表情 ${enabled?'ON':'OFF'} / ラジコンの言葉 ${radio?'ON':'OFF'} / 顔方向 ${follow?'ON':'OFF'}`);
    candidate=null;stable=0;lastAutomatic=Date.now();update();
  });
  el('command-form').addEventListener('submit',event=>{event.preventDefault();const id=actionForCommand(el<HTMLInputElement>('command').value);if(id&&['A13','A14','A15','A16'].includes(id)&&!radio)message('「ラジコンの言葉も使う」をONにしてください。');else if(id)void run(id);else message('「こっちきて」「右向いて」「左向いて」「止まれ」、ラジコンでは「前」「後ろ」「左」「右」を入力してください。');});
  root.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('change',()=>{
    stop();const value={...settings};
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setting]').forEach(field=>{const key=field.dataset.setting as keyof ActionSettings;if(key==='happy')value.happy=field.value as 'A08'|'A09';else value[key]=Number(field.value);});
    if(!validActionSettings(value)){message('停止間隔100〜2000ms、正面 < 30° < 45°の順で設定してください。');return;}
    settings=value;try{localStorage.setItem('colon-actions-v1',JSON.stringify(settings));message('動作設定をこのブラウザに保存しました。');}catch{message('このブラウザでは設定を保存できません。');}
  }));
  el('export').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'colon-actions/1',firmware:'1.7.0',settings,actions:ACTIONS},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='colon-actions-v1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const refresh=setInterval(()=>{
    if(!hooks.integrated&&hooks.session()?.transport.kind==='mock'&&el<HTMLInputElement>('mock-detected').checked){
      const size=el<HTMLInputElement>('mock-size').valueAsNumber,x=el<HTMLInputElement>('mock-x').valueAsNumber;
      receivePose({detected:true,x,size,at:Date.now()});
    }
    update();
  },200);
  el('mock-detected').addEventListener('change',()=>{if(!el<HTMLInputElement>('mock-detected').checked)pose=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('blur',()=>stop());
  window.addEventListener('pagehide',()=>{stop();clearInterval(refresh);unsubscribe();unregister();});
  update();return {update,run,stop,get running(){return runner.running;}};
}
