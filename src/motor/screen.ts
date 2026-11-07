import './screen.css';
import {INITIAL_SETTINGS,OPS,direction,isDirectFirmware,isCorrectedTurnFirmware,validSettings,type MotorSettings} from './protocol.ts';
import {BleTransport,MockTransport} from './transport.ts';
import {MotorSession} from './session.ts';
import {INITIAL_POWER,diagnosticRow,toCSV,type DiagnosticRow} from './diagnostics.ts';
import {mountPatternPanel} from './pattern-screen.ts';
import {mountUsbWriter} from './usb-screen.ts';
import {driveKey} from './keyboard.ts';

export function mountMotorTest(){
  document.title='Colon · Motor Control';
  document.body.innerHTML=`<header class="motor-header">
    <a href="?debug=1" class="motor-brand">c: <span>Colon <small>Motor Control</small></span></a>
    <button id="emergency" class="emergency">■ 緊急停止</button>
  </header>
  <main class="motor-shell">
    <section class="motor-intro"><div><p class="eyebrow">ATOM S3 × AE-DRV8835-S</p>
      <h1>AtomS3 ラジコン操作</h1><p>電池3V・出力100%。動作時間で調整します。</p>
    </div><span id="mode-badge" class="badge">モック</span></section>
    <div class="motor-layout">
      <aside class="motor-sidebar">
        <section class="motor-card"><h2>接続</h2>
          <label>接続先<select id="mode"><option value="mock">モック（実機なし）</option><option value="ble">AtomS3 · Bluetooth</option></select></label>
          <button id="connect" class="motor-primary">モックを接続</button>
          <button id="disconnect" class="motor-secondary" disabled>切断</button>
          <p class="subtle">実機はPCのChrome / Edge、AndroidのChromeに対応。iPhone Safariではモックを利用できます。</p>
          <a href="#usb-writer">AtomS3へ書き込む</a>
        </section>
        <section class="motor-card wiring"><h2>配線</h2>
          <p>G5 → AIN1　G6 → AIN2<br>G7 → BIN1　G8 → BIN2<br>3V3 → VCC　GND → MODE / GND<br>電池3V → VM</p>
          <p class="subtle">AOUT1/AOUT2とBOUT1/BOUT2に各モーターを接続します。電池のマイナスとGNDを共通にします。配線を変える際は電源を切ります。</p>
        </section>
      </aside>
      <div class="motor-content">
        <section class="motor-card" id="rc-control">
          <div class="section-top"><h2>ラジコン操作</h2><span id="rc-badge" class="badge">未接続</span></div>
          <p id="rc-help" class="motor-feedback" role="status"></p>
          <p id="rc-feedback" class="motor-feedback" role="status" hidden></p>
          <p id="rc-keyboard" tabindex="0" class="keyboard-help"><kbd>W</kbd> 前進　<kbd>S</kbd> 後進　<kbd>A</kbd> 左　<kbd>D</kbd> 右</p>
          <p id="rc-key" class="subtle">キーを押すと操作します。</p>
          <div class="drive-section">
            <div class="dpad">
              <button class="motion up" data-motion="forward">W ▲<span>前進</span></button>
              <button class="motion left" data-motion="left">A ◀<span>左旋回</span></button>
              <button id="dpad-stop" class="center">■<span>停止</span></button>
              <button class="motion right" data-motion="right">D ▶<span>右旋回</span></button>
              <button class="motion down" data-motion="backward">S ▼<span>後進</span></button>
            </div>
            <div class="speed-settings">
              <p class="fixed-output">出力 <strong>100%</strong></p>
              <label>キー操作の最大時間（ms）<input id="pulse" type="number" min="50" max="500" step="10" value="500"></label>
              <p class="subtle">押している間だけ動き、離すか上限時間に達すると停止します。続けるには一度離して、もう一度押してください。</p>
              <details><summary>モーターの方向設定</summary>
                <label class="check"><input id="invert-left" type="checkbox"> A出力（G5 / G6）を反転</label>
                <label class="check"><input id="invert-right" type="checkbox"> B出力（G7 / G8）を反転</label>
              </details>
            </div>
          </div>
          <button id="reset-estop" class="motor-secondary" hidden>緊急停止を解除</button>
          <p id="rc-last" class="subtle" hidden></p>
        </section>
        <section class="motor-card motor-state">
          <div class="section-top"><h2>接続・動作状態</h2><span id="arm-badge" class="badge">未接続</span></div>
          <dl id="telemetry"></dl>
          <div class="track-preview">
            <div><span>モーターA</span><strong id="left-state">未確認</strong><meter id="left-meter" min="0" max="100" value="0"></meter><small id="left-gpio">G5 / G6</small></div>
            <span class="track-divider">＋</span>
            <div><span>モーターB</span><strong id="right-state">未確認</strong><meter id="right-meter" min="0" max="100" value="0"></meter><small id="right-gpio">G7 / G8</small></div>
          </div>
          <p class="subtle">接続表示はBLE通信、出力表示は本体から返った指令値です。電池3Vは使用する電源の設定で、本体に電圧・回転の測定機能はありません。停止は空転停止です。</p>
        </section>
        <section class="motor-card">
          <div class="section-top"><h2>操作ログ <small id="log-count">0件</small></h2><div>
            <button id="export-json" class="motor-secondary compact">JSON</button>
            <button id="export-csv" class="motor-secondary compact">CSV</button>
          </div></div>
          <div class="log-scroll"><table><thead><tr><th>時刻</th><th>操作・停止理由</th><th>結果</th></tr></thead><tbody id="log-body"></tbody></table></div>
          <details id="mock-tools"><summary>モックの通信テスト</summary><div class="mock-tools">
            <button id="mock-disconnect" class="motor-secondary">モック通信断</button>
            <button id="mock-reboot" class="motor-secondary">モック再起動</button>
            <label class="check"><input id="pause-heartbeat" type="checkbox"> 心拍通信を止める</label>
          </div></details>
        </section>
        <footer class="motor-footer"><a href="?debug=1">Colonの画面へ</a><span>電池3V · 出力100% · 時間制御</span></footer>
      </div>
    </div>
  </main>`;
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const input=(id:string)=>el<HTMLInputElement>(id);
  let session:MotorSession|null=null;
  let connecting=false,held=false,activeMotion='',pointerId:number|null=null,heldKey:string|null=null;
  let heartbeatBusy=false,lastHeartbeatLog=0,lastMotion='';
  let patternPanel:{update():void}|null=null;
  const settings:MotorSettings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
  const power={...INITIAL_POWER,settingV:3};
  const logs:DiagnosticRow[]=[];
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-motion]'));
  const say=(message:string)=>{
    el('rc-feedback').textContent=message;el('rc-feedback').hidden=false;
  };
  function record(event:string,error?:string,result?:string){
    const row=diagnosticRow({
      phase:6,source:session?.connected?(session.transport.kind==='mock'?'mock':'firmware'):'disconnected',
      event,status:session?.status??null,pwm:settings,power,error,result,
    });
    logs.push(row);
    if(logs.length>1000)logs.shift();
    el('log-count').textContent=`${logs.length}件`;
    el('log-body').replaceChildren();
    for(const row of logs.slice(-35).reverse()){
      const tr=document.createElement('tr');
      for(const value of [new Date(row.timestamp).toLocaleTimeString('ja-JP'),row.event+(row.status?' · '+row.status.stopReason:''),row.error??row.result]){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      el('log-body').append(tr);
    }
  }
  function controlBlock(){
    const status=session?.status;
    if(!session?.connected||!status)return '左の「接続」から接続してください。';
    if(!isCorrectedTurnFirmware(status))return '左右旋回の修正版1.6.1をUSB欄から書き込んでください。';
    if(status.estop)return '緊急停止中です。「緊急停止を解除」を押してください。';
    if(!status.gpioReady)return '本体の初期化が完了していません。';
    if(!Number.isInteger(settings.pulseMs)||settings.pulseMs<50||settings.pulseMs>500)return '最大時間は50〜500msで指定してください。';
    return '';
  }
  function update(){
    const s=session?.status,connected=!!session?.connected,mock=session?.transport.kind==='mock';
    if(!connected){held=false;pointerId=null;heldKey=null;lastMotion='';}
    const moving=!!s&&(s.left!==0||s.right!==0);
    const selectedMock=el<HTMLSelectElement>('mode').value==='mock';
    el('mode-badge').textContent=selectedMock?'モック · 実機なし':'AtomS3 · Bluetooth';
    el('connect').textContent=selectedMock?'モックを接続':'AtomS3に接続';
    el<HTMLButtonElement>('connect').disabled=connected||connecting;
    el<HTMLButtonElement>('disconnect').disabled=!connected;
    el<HTMLSelectElement>('mode').disabled=connected||connecting;
    const state=!connected?'未接続':s?.estop?'緊急停止':moving?'動作指令中':session?.foregroundBusy?'操作準備中':'接続済み・停止中';
    el('rc-badge').textContent=el('arm-badge').textContent=state;
    const blocked=controlBlock();
    el('rc-help').textContent=blocked||(moving?'出力指令中です。停止ボタンで中断できます。':session?.foregroundBusy?'通信処理中です。停止ボタンで中断できます。':held?'上限時間で停止しました。一度離してから次の操作をしてください。':'方向ボタンまたはW・S・A・Dで操作できます。');
    const canMove=!blocked&&(!session?.foregroundBusy||held);
    for(const button of buttons){
      button.disabled=!canMove||(held&&button.dataset.motion!==activeMotion);
      button.classList.toggle('is-held',held&&button.dataset.motion===activeMotion);
    }
    el('reset-estop').hidden=!s?.estop;
    el<HTMLButtonElement>('reset-estop').disabled=!connected||!!session?.foregroundBusy;
    input('pulse').disabled=held||!!session?.foregroundBusy||moving;
    for(const id of ['invert-left','invert-right'])input(id).disabled=held||!!session?.foregroundBusy||moving;
    el('mock-tools').hidden=!mock;
    el('rc-last').hidden=!lastMotion;el('rc-last').textContent=lastMotion;
    const entries:Record<string,string>={
      'AtomS3':connected?(mock?'モック接続':'BLE接続済み'):'未接続',
      'ファーム':s?.firmware??'未取得','電源設定':'電池3V','出力設定':'100%固定',
      '稼働時間':s?`${(s.uptimeMs/1000).toFixed(1)}秒`:'未取得',
      '起動回数':s?.bootCount==null?'未取得':String(s.bootCount),
      '再起動理由':s?.resetReason??'未取得','停止理由':s?.stopReason??'未取得',
      '最終心拍応答':session?.lastHeartbeatAt?new Date(session.lastHeartbeatAt).toLocaleTimeString('ja-JP')+(connected?'':'（切断前）'):'未取得',
    };
    el('telemetry').replaceChildren();
    for(const [name,value] of Object.entries(entries)){
      const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=name;dd.textContent=value;div.append(dt,dd);el('telemetry').append(div);
    }
    for(const side of ['left','right'] as const){
      const value=s?.[side],physical=side==='left'?s?.physicalLeft:s?.physicalRight;
      el(`${side}-state`).textContent=value===undefined?'未確認':value===0?'停止 · 0%':`${value>0?'正転':'逆転'} · ${Math.abs(value)}%`;
      el<HTMLMeterElement>(`${side}-meter`).value=Math.abs(value??0);
      el(`${side}-gpio`).textContent=physical===undefined?(side==='left'?'G5 / G6':'G7 / G8'):`IN1 ${physical>0?'HIGH':'LOW'} / IN2 ${physical<0?'HIGH':'LOW'}`;
    }
    patternPanel?.update();
  }
  async function connect(){
    if(connecting||session?.connected)return;
    connecting=true;update();
    const next=new MotorSession(el<HTMLSelectElement>('mode').value==='mock'?new MockTransport(false,true):new BleTransport());
    session=next;next.onStatus=()=>{if(session===next)update();};
    next.onEvent=(event,error)=>{
      if(session!==next)return;
      if(event!=='HEARTBEAT'||Date.now()-lastHeartbeatLog>1000){
        record(event,error);if(event==='HEARTBEAT')lastHeartbeatLog=Date.now();
      }
      if(error)say(error);
      if(event==='disconnect')say('切断しました。再接続後、新しい操作で再開してください。');
    };
    try{
      await next.connect();
      next.settings=isDirectFirmware(next.status)?{...settings}:{...INITIAL_SETTINGS};
      say(isCorrectedTurnFirmware(next.status)?'接続しました。方向キーや動作ボタンで操作してください。':controlBlock());
    }catch(error){next.disconnect();say(String(error));}
    finally{connecting=false;update();}
  }
  function stop(emergency=false){
    held=false;pointerId=null;heldKey=null;
    if(!session?.connected){say('未接続です。');update();return;}
    session.requestStop(emergency);
    say(emergency?'緊急停止を要求しました。必要に応じて電池の電源も切ってください。':'停止を要求しました。');
    record(emergency?'emergency-request':'stop-request');update();
  }
  async function startMotion(name:string){
    if(held||controlBlock()||!session||session.foregroundBusy)return;
    const current=session;held=true;activeMotion=name;update();
    const [left,right]=direction(name,100,100,isCorrectedTurnFirmware(current.status));
    try{
      await current.drive(left,right);
      if(session===current){
        lastMotion=`直近の指令　${buttons.find(b=>b.dataset.motion===name)?.textContent?.trim()??name}　出力100%`;
        record(`motion:${name}`);say('指令を送りました。離すか設定時間で停止します。');
      }
    }catch(error){if(held&&session===current){stop();say(String(error));}}
    update();
  }
  el('connect').addEventListener('click',()=>void connect());
  el('disconnect').addEventListener('click',()=>{stop();session?.disconnect();update();});
  el('mode').addEventListener('change',()=>{stop();session?.disconnect();session=null;update();});
  for(const id of ['emergency','dpad-stop'])el(id).addEventListener('click',()=>stop(id==='emergency'));
  el('reset-estop').addEventListener('click',async()=>{
    try{await session?.send(OPS.RESET_ESTOP);say('緊急停止を解除しました。次の操作を待っています。');}
    catch(error){say(String(error));}update();
  });
  for(const button of buttons){
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||held)return;
      event.preventDefault();pointerId=event.pointerId;button.setPointerCapture(event.pointerId);
      void startMotion(button.dataset.motion!);
    });
    button.addEventListener('pointerup',event=>{if(pointerId===event.pointerId)stop();});
    button.addEventListener('pointercancel',()=>{if(held)stop();});
    button.addEventListener('lostpointercapture',()=>{if(held)stop();});
    button.addEventListener('keydown',event=>{
      if((event.key===' '||event.key==='Enter')&&!event.repeat){event.preventDefault();void startMotion(button.dataset.motion!);}
    });
    button.addEventListener('keyup',event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();stop();}});
  }
  window.addEventListener('keydown',event=>{
    const key=driveKey(event.code,event.key);
    if(!key||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||document.hidden)return;
    if(event.target instanceof Element&&event.target.closest('input,select,textarea,[contenteditable]'))return;
    event.preventDefault();const blocked=controlBlock();
    if(blocked){el('rc-key').textContent=`${key.label} を検知。${blocked}`;return;}
    if(session?.foregroundBusy){el('rc-key').textContent='通信処理中です。完了後にもう一度押してください。';return;}
    if(held)return;
    heldKey=key.token;el('rc-key').textContent=`${key.label} を受け付けました。`;
    void startMotion(key.motion);
  },true);
  window.addEventListener('keyup',event=>{
    const key=driveKey(event.code,event.key);
    if(!key||heldKey!==key.token)return;
    event.preventDefault();el('rc-key').textContent=`${key.label} を離しました。`;stop();
  },true);
  function settingsChanged(){
    stop();settings.pulseMs=input('pulse').valueAsNumber;
    settings.invertLeft=input('invert-left').checked;settings.invertRight=input('invert-right').checked;
    if(session&&isDirectFirmware(session.status)&&validSettings(settings))session.settings={...settings};
    update();
  }
  for(const id of ['pulse','invert-left','invert-right'])el(id).addEventListener('input',settingsChanged);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('blur',()=>{if(session?.connected)stop();});
  window.addEventListener('pagehide',()=>{stop();session?.disconnect();});
  el('mock-disconnect').addEventListener('click',()=>session?.disconnect());
  el('mock-reboot').addEventListener('click',()=>{
    if(session?.transport instanceof MockTransport){stop();session.transport.reboot();void session.poll();}
  });
  setInterval(()=>{void session?.poll();},150);
  setInterval(async()=>{
    if(heartbeatBusy||document.hidden||!session?.connected||session.busy||(session.transport.kind==='mock'&&input('pause-heartbeat').checked))return;
    heartbeatBusy=true;
    try{await session.heartbeat();}catch(error){say(String(error));}finally{heartbeatBusy=false;}
  },120);
  function download(data:string,type:string,extension:string){
    const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');
    a.href=url;a.download=`colon-motor-${Date.now()}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  el('export-json').addEventListener('click',()=>download(JSON.stringify({schema:'colon-motor-diagnostics/1',logs},null,2),'application/json','json'));
  el('export-csv').addEventListener('click',()=>download(toCSV(logs),'text/csv;charset=utf-8','csv'));
  patternPanel=mountPatternPanel({session:()=>session,blocked:controlBlock,stop,say,record,directControl:true});
  mountUsbWriter({beforeConnect:()=>{stop();session?.disconnect();session=null;update();},record});
  document.querySelector('.motor-content')!.prepend(el('rc-control'),document.querySelector('.motor-state')!,document.querySelector('.pattern-panel')!);
  update();
}
