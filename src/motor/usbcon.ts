import {mountMotorTest} from './screen.ts';
import {PadGate,PAD_DIRECTIONS,padInputs,defaultPadMapping,validPadMapping,type PadMapping,type PadSnapshot} from './usb-gamepad.ts';
import {isCommonTimingFirmware} from './protocol.ts';

const motor=mountMotorTest();
document.title='ファーム1.8.0 USBcon';
document.querySelector('h1')!.textContent='ファーム1.8.0 USBcon';
const card=document.createElement('section');card.className='motor-card';card.id='usbcon';
card.innerHTML=`<h2>スーパーファミコン型 USBコントローラー</h2>
<p>USBコントローラーをPCへ挿し、この画面をクリックしてコントローラーのボタンを1回押してください。左の接続欄でモックまたはAtomS3を接続します。</p>
<p class="motor-feedback" id="pad-status" role="status">コントローラーを探しています</p>
<label>使うコントローラー<select id="pad-device"><option value="">未検出</option></select></label>
<p id="pad-live">入力：なし</p>
<p>十字キー：上＝前進、下＝後進、左＝左旋回、右＝右旋回。押している間だけ、100%・最大0.5秒。上限で止まったら一度離して押し直します。十字キー以外のボタン＝停止。斜め入力＝停止。</p>
<details><summary>十字キーの割当を変更</summary><p>動かない場合は割当ボタンを押し、コントローラーの該当方向を1回押してください。設定中は駆動しません。入力番号は製品ごとに異なります。</p><div id="pad-mapping"></div><button id="pad-default" class="motor-secondary">標準の割当に戻す</button></details>
<p id="pad-help" class="subtle">AtomS3との接続はBLEです。本体はcolon-motor-1.8.0を使い、再書込みは不要です。PC Chrome / EdgeのlocalhostまたはHTTPSで開いてください。コントローラーを抜く・画面から離れると停止します。</p>
<a href="./?motor=1">通常のMotor Controlへ</a>`;
document.querySelector('.motor-content')!.prepend(card);
const status=card.querySelector<HTMLElement>('#pad-status')!,live=card.querySelector<HTMLElement>('#pad-live')!,select=card.querySelector<HTMLSelectElement>('#pad-device')!;
const gate=new PadGate();let identity='',mapping:PadMapping=defaultPadMapping(false),learn:string|null=null,learningNeutral=false,lastList='',lastInputs='',fault='';
const labels={forward:'上・前進',backward:'下・後進',left:'左旋回',right:'右旋回'};
function reset(){gate.reset();}
window.addEventListener('motor-control-stop',reset);
function suspend(){gate.reset();motor.stop();}
select.onchange=()=>{identity='';suspend();};
function mappingUI(){
  const area=card.querySelector('#pad-mapping')!;area.replaceChildren();
  for(const direction of PAD_DIRECTIONS){const row=document.createElement('p'),button=document.createElement('button');button.className='motor-secondary';button.textContent=labels[direction]+'：'+mapping[direction]+'（割当）';button.dataset.padDirection=direction;button.onclick=()=>{suspend();learn=direction;learningNeutral=false;status.textContent='すべて離してから「'+labels[direction]+'」を押してください。';};row.append(button);area.append(row);}
}
function save(){try{localStorage.setItem('colon-usbcon:'+identity,JSON.stringify(mapping));}catch{}mappingUI();}
card.querySelector<HTMLButtonElement>('#pad-default')!.onclick=()=>{suspend();try{localStorage.removeItem('colon-usbcon:'+identity);}catch{}identity='';learn=null;};
for(const event of ['blur','pagehide','gamepaddisconnected'])window.addEventListener(event,suspend);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
function tick(){
  try{
    if(!navigator.getGamepads){status.textContent='このブラウザはGamepad APIに対応していません。PC Chrome / Edgeで開いてください。';return;}
    const pads=Array.from(navigator.getGamepads()).filter((p):p is Gamepad=>!!p&&p.connected);
    const list=JSON.stringify(pads.map(p=>[p.index,p.id]));
    if(list!==lastList){const selected=select.value;select.replaceChildren();for(const p of pads){const o=document.createElement('option');o.value=String(p.index);o.textContent=p.id;select.append(o);}if(pads.some(p=>String(p.index)===selected))select.value=selected;lastList=list;}
    const pad=pads.find(p=>String(p.index)===select.value) as PadSnapshot|undefined;
    if(!pad){if(identity)suspend();identity='';status.textContent='USBコントローラー未検出。画面をクリックし、コントローラーのボタンを押してください。';return;}
    const key=pad.id+':'+pad.index;
    if(identity!==key){suspend();identity=key;mapping=defaultPadMapping(pad.mapping==='standard');try{const saved=JSON.parse(localStorage.getItem('colon-usbcon:'+identity)??'null');if(validPadMapping(saved))mapping=saved;}catch{}mappingUI();learn=null;}
    const inputs=padInputs(pad);live.textContent='入力：'+(inputs.join(' / ')||'なし');
    if(learn){if(!inputs.length)learningNeutral=true;if(inputs.length&&learningNeutral){const input=inputs.find(i=>i.startsWith('b'))??inputs[0];const next={...mapping,[learn]:input};if(validPadMapping(next)){mapping=next;save();learn=null;gate.reset();}else{status.textContent='他の方向と同じ割当です。別の方向を押してください。';learningNeutral=false;}}return;}
    const firmware=motor.session()?.status;
    const available=!document.hidden&&document.hasFocus()&&motor.ready()&&isCommonTimingFirmware(firmware);
    status.textContent=pad.id+' · '+(!available?'本体接続・ファーム1.8.0・停止状態を確認してください。':'入力待ち · 一度離してから操作')+(fault?' · '+fault:'');
    const result=gate.sample(inputs,mapping,available);
    if(result.stop&&inputs.join()!==lastInputs)suspend();
    if(result.start)void motor.start(result.start).catch(e=>{fault=String(e);suspend();});
    lastInputs=inputs.join();
  }catch(error){status.textContent='コントローラー取得エラー：'+String(error);suspend();}
}
setInterval(tick,40);mappingUI();tick();
