import './screen.css';
import {OPS,INITIAL_SETTINGS,RC_MAX_DUTY,direction,isRcFirmware,validSettings,type MotorSettings} from './protocol.ts';
import {BleTransport,MockTransport} from './transport.ts';
import {MotorSession} from './session.ts';
import {INITIAL_POWER,diagnosticRow,toCSV,validatePower,type DiagnosticRow,type PowerRecord} from './diagnostics.ts';
import {mountPatternPanel} from './pattern-screen.ts';
import {mountUsbWriter} from './usb-screen.ts';
import {singleTestBlock} from './single-test.ts';

export function mountMotorTest(){
  document.title='Colon · Motor Test v1.3';
  document.body.innerHTML=`<header class="motor-header"><a href="?debug=1" class="motor-brand">c: <span>Colon <small>Motor Test <b>v1.3</b></small></span></a><button id="emergency" class="emergency">■ 緊急停止</button></header>
  <main class="motor-shell"><section class="motor-intro"><div><p class="eyebrow">ATOM S3 × AE-DRV8835-S</p><h1>AtomS3 ラジコン操作</h1><p>最初はモックから。1回の操作は最大500ms、停止後は再許可が必要です。</p></div><span id="mode-badge" class="badge">モック · 実機を動かしません</span></section>
  <section class="motor-alert"><strong>電源は、まだ未確認です</strong><p>DC-DCの1.5Vは設定値です。実測値ではありません。表示消灯とUSB出力停止は別々に記録してください。信号試験版はVMなし。本体単独版は1.5V想定・未測定の限定試験です。短いパルスやPWMは過電圧対策にはなりません。</p></section>
  <div class="motor-layout"><aside class="motor-sidebar"><section class="motor-card"><h2>01 接続と試験段階</h2><label>接続方式<select id="mode"><option value="mock">モック（実機接続なし）</option><option value="ble">実機 BLE（対応ブラウザ）</option></select></label><p class="subtle">iPhone Safari：モック・診断記録のみ。実機BLEはPC Chrome / Edge、Android Chromeなど。</p><button id="connect" class="motor-primary">モックを接続</button><button id="disconnect" class="motor-secondary" disabled>切断</button><label>現在のテスト段階<select id="phase"><option value="2">Phase 2 · モック確認</option><option value="3">Phase 3 · ATOM単体 / VMを外す</option><option value="4">Phase 4 · 信号試験 / モーターなし</option><option value="5">Phase 5 · 本体のモーター単独試験</option><option value="6">Phase 6 · 走行（適合確認後）</option><option value="7">Phase 7 · 電源観察 / 駆動なし</option></select></label></section>
  <section class="motor-card"><h2>02 制御を許可する</h2><p class="subtle">モックはそのまま試せます。実機では現物を確認してください。</p><label class="check"><input type="checkbox" id="check-wiring"> GPIO・MODE=GND・共通GNDを確認</label><label class="check"><input type="checkbox" id="check-switch"> VMの物理スイッチ・遮断手段を用意</label><label class="check"><input type="checkbox" id="check-tracks"> キャタピラを浮かせ、周囲を確保</label><label class="check"><input type="checkbox" id="check-power"> 信号試験ではVMを物理的に外した</label><label class="check"><input type="checkbox" id="signal-only" checked> 信号のみ試験（モーター電源なし）</label><label class="check"><input type="checkbox" id="single-test"> 本体単独試験（1.5V想定・未測定／片側100ms）</label><p class="subtle" id="single-note">単独版は左右1個ずつ、出力25/50/75%、最大100ms。走行・パターン実行・表情連動は使えません。電圧・電流・部品適合を保証するモードではありません。</p><p id="arm-reason" class="arm-reason">先にモックを接続してください。</p><button id="arm" class="motor-primary" disabled>確認して1回の試験を許可</button><button id="reset-estop" class="motor-secondary" disabled>緊急停止を解除（再許可は別）</button></section>
  <section class="motor-card wiring"><h2>GPIO / IN・IN</h2><p>G5 → AIN1　G6 → AIN2<br>G7 → BIN1　G8 → BIN2<br>3V3 → VCC　GND → MODE / GND</p><p class="subtle">A出力：左 / B出力：右<br>LOW・LOWはHi-Zの空転停止。<br>軸の即時停止や固定は保証しません。</p></section></aside>
  <div class="motor-content"><section class="motor-card motor-state"><div class="section-top"><h2>接続・停止状態</h2><span id="arm-badge" class="badge">駆動禁止</span></div><dl id="telemetry"></dl><div class="track-preview"><div><span>左モーター</span><strong id="left-state">未確認</strong><meter id="left-meter" min="0" max="100" value="0"></meter><small id="left-gpio">G5 / G6</small></div><span class="track-divider">＋</span><div><span>右モーター</span><strong id="right-state">未確認</strong><meter id="right-meter" min="0" max="100" value="0"></meter><small id="right-gpio">G7 / G8</small></div></div><p id="feedback" class="motor-feedback" role="status">接続後に安全確認を行ってください。自動で実機に接続・送信しません。</p></section>
  <section class="motor-card"><div class="section-top"><h2>モーター単体テスト</h2><span class="subtle">押している間のみ · 上限到達で停止</span></div><div class="single-controls"><button class="motion" data-motion="lf">左 正転 ↻</button><button class="motion" data-motion="lr">左 逆転 ↺</button><button class="motion" data-motion="rf">右 正転 ↻</button><button class="motion" data-motion="rr">右 逆転 ↺</button></div><button id="stop" class="stop-wide">■ 左右停止・許可解除</button></section>
  <section class="motor-card" id="rc-control"><div class="section-top"><h2>ラジコン操作</h2><span id="rc-badge" class="badge">未接続</span></div>
  <p id="rc-help" class="motor-feedback"></p>
  <div class="rc-actions"><button id="rc-arm" class="motor-primary" disabled>1回の操作を許可</button><a href="#power-form">実測値を記録</a><a href="#usb-writer">ファームを書き込む</a></div>
  <p id="rc-motion" class="subtle">方向ボタンを押し続けると動きます。PCでは矢印キーでも操作できます。</p>
  <p id="rc-last" class="subtle" hidden></p>
  <div class="drive-section"><div class="dpad"><button class="motion up" data-motion="forward">▲<span>前進</span></button><button class="motion left" data-motion="left">◀<span>左旋回</span></button><button id="dpad-stop" class="center">■<span>停止</span></button><button class="motion right" data-motion="right">▶<span>右旋回</span></button><button class="motion down" data-motion="backward">▼<span>後退</span></button></div><div class="speed-settings"><label>左の速度 <output id="left-percent">20%</output><input id="left-speed" type="range" min="0" max="100" step="1" value="20"></label><label>右の速度 <output id="right-percent">20%</output><input id="right-speed" type="range" min="0" max="100" step="1" value="20"></label><label class="check"><input id="invert-left" type="checkbox"> 左の方向を反転</label><label class="check"><input id="invert-right" type="checkbox"> 右の方向を反転</label></div></div><div class="timing-settings"><label>最大パルス（ms）<input id="pulse" type="number" value="200" min="50" max="500" step="10"></label><label>PWM周波数（Hz）<input id="frequency" type="number" value="1000" min="100" max="20000" step="100"></label></div><p class="subtle">ソフトスタート：0→100%に約100ms。正逆切替は停止・100ms待機・再許可が必要です。PWMは速度制御であり、過電圧を安全にするものではありません。</p></section>
  <section class="motor-card"><div class="section-top"><h2>電源診断メモ</h2><span class="badge neutral">手入力・測定記録</span></div><div class="unmeasured"><span>SMARTCOBY内部電圧 <b>未測定</b></span><span>DC-DC入力電圧 <b>未測定</b></span><span>出力電圧の自動取得 <b>未測定</b></span><span>モーター実電流 <b>未測定</b></span><span>低負荷停止判定 <b>取得不可</b></span></div><form id="power-form"><div class="power-grid"><label>DC-DC設定値（V・実測ではない）<input id="setting-v" type="number" step="0.01" min="0" max="12" value="1.5" required></label><label>DC-DC実測電圧（V）<input id="measured-v" type="number" step="0.01" min="0" max="20" placeholder="未測定"></label><label>表示消灯まで（秒）<input id="display-off" type="number" step="0.1" min="0" placeholder="未測定"></label><label>消灯後のUSB出力<select id="output-after"><option value="unknown">未確認</option><option value="maintained">出力は維持（測定で確認）</option><option value="stopped">出力停止（測定で確認）</option></select></label><label>モーター駆動時の電源状態<input id="motor-power" maxlength="150" placeholder="未確認"></label><label>発熱<select id="heat"><option value="unknown">未確認</option><option value="none">なし（観察）</option><option value="present">あり → 試験中止</option></select></label><label>測定日時（端末のローカル時刻）<input id="measured-at" type="datetime-local"></label><label>試験結果メモ<input id="result" maxlength="150" placeholder="例：表示消灯後も出力を実測できた"></label></div><button class="motor-secondary" type="submit">診断メモをログへ記録</button></form><p class="subtle">画面の入力値はセンサー値ではありません。無負荷 / 駆動中、単独 / 同時給電を区別して記録してください。発熱時は通電を中止してください。</p></section>
  <section class="motor-card"><div class="section-top"><h2>診断ログ <small id="log-count">0件</small></h2><div><button id="export-json" class="motor-secondary compact">JSON</button><button id="export-csv" class="motor-secondary compact">CSV</button></div></div><div class="log-scroll"><table><thead><tr><th>時刻 / 情報源</th><th>操作・停止理由</th><th>結果</th></tr></thead><tbody id="log-body"></tbody></table></div><div class="mock-tools"><button id="mock-disconnect" class="motor-secondary">モック通信断</button><button id="mock-reboot" class="motor-secondary">モック再起動</button><label class="check"><input id="pause-heartbeat" type="checkbox"> モックのHBを停止して試験</label></div><p class="subtle">ログはこの画面のメモリ内に最大1000件。再読込み前に書き出してください。モックの値は実測値として出力しません。</p></section>
  <footer class="motor-footer"><a href="?debug=1">← Colonの画面に戻る</a><span>ラジコン走行試験はVM実測・配線確認後に実施</span></footer></div></div></main>`;
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const input=(id:string)=>el<HTMLInputElement>(id);
  let session:MotorSession|null=null,settings:MotorSettings={...INITIAL_SETTINGS},power:PowerRecord={...INITIAL_POWER};
  let logs:DiagnosticRow[]=[],phase=2,heartbeatBusy=false,held=false,activeMotion='',pointerId:number|null=null,heldKey:string|null=null,lastHeartbeatLog=0,observedStop='';
  let patternPanel:{update():void}|null=null;
  let powerRecordDirty=false;
  let lastMotion='';
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-motion]'));
  const say=(message:string)=>{el('feedback').textContent=message;};
  function record(event:string,error?:string,result?:string){
    const row=diagnosticRow({phase,source:session?.connected?(session.transport.kind==='mock'?'mock':'firmware'):'disconnected',event,status:session?.status??null,pwm:settings,power,error,result});
    logs.push(row);if(logs.length>1000)logs.shift();el('log-count').textContent=`${logs.length}件`;
    const body=el('log-body');body.replaceChildren();
    logs.slice(-35).reverse().forEach(r=>{const tr=document.createElement('tr');for(const value of [new Date(r.timestamp).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo'})+' / '+r.source,r.event+(r.status?' · '+r.status.stopReason:''),r.error??r.result]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);});
  }
  function armBlock(){
    if(!session?.connected||!session.status)return '先に接続してください。';
    if(session.status.estop)return '緊急停止中。解除後に安全確認と再許可が必要です。';
    if(!session.status.gpioReady)return 'GPIO初期化が完了していません。';
    if(!validSettings(settings))return 'PWM周波数・最大パルスを確認してください。';
    if(session.transport.kind==='mock'){
      return singleTestBlock(session.status,settings,power,phase);
    }
    if(settings.rcTest){
      if(phase!==6)return '走行試験はPhase 6を選んでください。';
      if(powerRecordDirty||power.measuredV===null||!power.measuredAt)return 'VM–GND間を実測し、電源診断で電圧と測定日時を記録してください。';
      if(!(power.measuredV>0&&power.measuredV<=1.5))return '試験範囲外です。VMの実測値は0Vより大きく1.5V以下が条件です。';
      if(power.heat==='present'||power.outputAfterOff==='stopped')return '電源停止または発熱の記録があります。原因の確認が必要です。';
    }
    if(!['check-wiring','check-switch','check-tracks','check-power'].every(id=>input(id).checked))return '左側の「制御を許可する」で、実機の4項目を確認してください。';
    const singleBlock=singleTestBlock(session.status,settings,power,phase);if(singleBlock)return singleBlock;
    if(settings.singleTest||settings.rcTest)return '';
    if(session.transport.kind==='ble'){
      if(phase===2||phase===7)return 'この段階では実機駆動を許可しません。';
      if((phase===3||phase===4)&&!settings.signalOnly)return 'Phase 3・4はVMを外した信号のみ試験です。';
      if(phase>=5&&settings.signalOnly)return 'Phase 5・6は適合確認済みの通電試験が必要です。現在は信号のみ設定です。';
      if(!settings.signalOnly&&(!session.status.powerQualified||power.measuredV===null||power.measuredV<=0||power.measuredV>1.5||power.heat==='present'))return '通電ロック：1.5V適合・実測・発熱・電流容量の確認が未完了です。';
    }
    return '';
  }
  function update(){
    patternPanel?.update();
    const s=session?.status??null,connected=!!session?.connected;
    const patternSection=document.querySelector<HTMLElement>('.motor-content > .pattern-panel');if(patternSection)patternSection.hidden=!!s?.singleTest||!!settings.singleTest||!!settings.rcTest;
    if(!connected){held=false;pointerId=null;heldKey=null;lastMotion='';}
    el('mode-badge').textContent=el<HTMLSelectElement>('mode').value==='mock'?'モック · 実機を動かしません':'実機 BLE · 対応FWと安全確認が必要';
    el('connect').textContent=el<HTMLSelectElement>('mode').value==='mock'?'モックを接続':'実機BLEを選んで接続';
    el('arm-badge').textContent=s?.armed?(session?.transport.kind==='mock'?'モックで許可中':settings.singleTest?'未測定1.5V想定・片側100msのみ':s.signalOnly?'GPIO信号試験を許可':'通電試験を許可'):s?.estop?'緊急停止・再許可禁止':'駆動禁止';
    const entries:Record<string,string>={'ATOM S3':connected?(session?.transport.kind==='mock'?'仮想接続（実機なし）':'BLE接続中'):'未接続','接続方式':session?.transport.kind==='mock'?'モック':connected?'Web Bluetooth':'未接続','ファーム':s?.firmware??'未取得','本体液晶':!s?'未取得':s.lcd===true?'表示処理起動済み（現物で確認）':s.lcd===false?'表示の初期化未完了':'この版は液晶の状態通知なし','稼働時間':s?`${(s.uptimeMs/1000).toFixed(1)}秒${session?.transport.kind==='mock'?'（模擬）':''}`:'未取得','起動回数':s?.bootCount===null?'取得不可':s?String(s.bootCount):'未取得','再起動理由':s?.resetReason??'未取得','最終HB応答':session?.lastHeartbeatAt?new Date(session.lastHeartbeatAt).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo'})+(connected?'':'（切断前）'):'未取得','停止理由':s?.stopReason??'接続なし・実機停止は未確認','電源扱い':settings.singleTest?'1.5V想定・実測未確認／適合保証なし':power.measuredV===null?'未測定':'手入力実測（適合判定とは別）'};
    const dl=el('telemetry');dl.replaceChildren();Object.entries(entries).forEach(([key,value])=>{const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;d.append(dt,dd);dl.append(d);});
    for(const side of ['left','right'] as const){const n=s?.[side];el(`${side}-state`).textContent=n===undefined?'未確認':n===0?'出力0% · 空転停止':`${n>0?'論理正転':'論理逆転'} ${Math.abs(n)}%`;el<HTMLMeterElement>(`${side}-meter`).value=Math.abs(n??0);const value=side==='left'?s?.physicalLeft:s?.physicalRight;el(`${side}-gpio`).textContent=value===undefined?(side==='left'?'G5 / G6':'G7 / G8'):`出力指令：IN1 ${value>0?'PWM':'LOW'} / IN2 ${value<0?'PWM':'LOW'}`;}
    const block=armBlock();
    el('arm-reason').textContent=block||'条件を確認しました。許可ボタンを押すと1回だけ試験できます。';
    const motionActive=!!s&&(s.left!==0||s.right!==0);
    const mock=session?.transport.kind==='mock';
    const drivingSupported=(mock&&!settings.singleTest)||!!settings.rcTest;
    const rcBlock=!connected?'左側の「接続と試験段階」からモック、または実機BLEへ接続してください。'
      :!drivingSupported?(settings.singleTest?'本体単独版は下の「モーター単体テスト」で操作します。十字キーで走行するにはラジコン試験版1.3.0が必要です。':'信号試験版ではモーターは回りません。十字キーで走行するにはラジコン試験版1.3.0を選んでください。')
      :block;
    el('rc-help').textContent=rcBlock||(motionActive?'出力指令中。離すか、上限時間に達すると停止します。':s?.armed?'操作できます。方向ボタンを押し続けてください。':'「1回の操作を許可」を押してから、前進・後退・左右旋回を試してください。');
    el('rc-badge').textContent=!connected?'未接続':motionActive?(mock?'モック動作中':'出力指令中'):s?.armed?'許可済み':mock?'モック接続済み':'実機BLE接続済み';
    const armDisabled=!!block||!!s?.armed||!!session?.foregroundBusy;
    el<HTMLButtonElement>('arm').disabled=armDisabled;
    el<HTMLButtonElement>('rc-arm').disabled=armDisabled||!drivingSupported;
    el('rc-motion').textContent=s?.stopReason==='pulse-limit'
      ?'上限時間で停止しました。次の操作には再許可が必要です。'
      :'方向を押し続けて操作、離すと停止。PCでは矢印キーも使えます。';
    el('rc-last').hidden=!lastMotion;
    el('rc-last').textContent=lastMotion;
    const canMove=!!s?.armed&&!s.estop&&connected&&!block&&(!session?.foregroundBusy||held);
    buttons.forEach(b=>{b.disabled=!canMove||(held&&b.dataset.motion!==activeMotion)||(!!settings.singleTest&&!['lf','lr','rf','rr'].includes(b.dataset.motion!));});
    el<HTMLButtonElement>('disconnect').disabled=!connected;el<HTMLButtonElement>('connect').disabled=connected;
    el<HTMLButtonElement>('reset-estop').disabled=!connected||!s?.estop;
    el<HTMLSelectElement>('mode').disabled=connected;
    el('mock-disconnect').hidden=el('mock-reboot').hidden=session?.transport.kind!=='mock';
    el('pause-heartbeat').closest('label')!.classList.toggle('hidden',session?.transport.kind!=='mock');
    if(s&&observedStop!==s.stopReason){observedStop=s.stopReason;if(!s.armed&&held){held=false;pointerId=null;heldKey=null;say(`停止しました：${s.stopReason}。次の操作前に再許可してください。`);}}
  }
  async function connect(){
    try{const transport=el<HTMLSelectElement>('mode').value==='mock'?new MockTransport(!!settings.singleTest):new BleTransport();session=new MotorSession(transport);session.settings=settings;
      session.onStatus=update;session.onEvent=(event,error)=>{if(event!=='HEARTBEAT'||Date.now()-lastHeartbeatLog>1000){record(event,error);if(event==='HEARTBEAT')lastHeartbeatLog=Date.now();}if(error)say(error);};
      await session.connect();
      if(transport.kind==='ble'){
        input('single-test').checked=!!session.status?.singleTest;
        input('signal-only').checked=!input('single-test').checked&&!isRcFirmware(session.status);
        phase=isRcFirmware(session.status)?6:session.status?.singleTest?5:3;
        el<HTMLSelectElement>('phase').value=String(phase);
        applySingleMode();
      }else if(session.status?.singleTest){
        phase=5;
        el<HTMLSelectElement>('phase').value='5';
        applySingleMode();
      }
      say(transport.kind==='mock'?'モックに接続しました。実機への信号送信はありません。':'専用ファームへ接続しました。まだ駆動は許可されていません。');
    }catch(e){session?.disconnect();say(String(e));record('connect-error',String(e));}update();
  }
  function stop(emergency=false){held=false;pointerId=null;heldKey=null;session?.requestStop(emergency);say(emergency?'緊急停止を要求しました。実機の場合はVMの物理スイッチも切ってください。':'停止を要求しました。応答がない場合もファーム側の上限時間で停止します。');record(emergency?'emergency-request':'stop-request');update();}
  el('connect').addEventListener('click',()=>void connect());el('disconnect').addEventListener('click',()=>{stop();session?.disconnect();record('manual-disconnect');update();});
  el('mode').addEventListener('change',()=>{
    stop();session?.disconnect();session=null;
    if(el<HTMLSelectElement>('mode').value==='mock'){
      input('single-test').checked=false;
      input('signal-only').checked=true;
      phase=2;
      el<HTMLSelectElement>('phase').value='2';
      applySingleMode();
    }
    update();
  });
  el('phase').addEventListener('change',()=>{stop();phase=Number(el<HTMLSelectElement>('phase').value);['check-wiring','check-switch','check-tracks','check-power'].forEach(id=>input(id).checked=false);record('phase-change');update();});
  async function arm(){
    if(armBlock()||!session)return;
    try{
      session.settings={...settings};
      await session.arm();
      say('1回の試験を許可しました。押している間だけ、指定時間を上限に動作します。');
    }catch(e){say(String(e));}
    update();
  }
  for(const id of ['arm','rc-arm'])el(id).addEventListener('click',()=>void arm());
  el('reset-estop').addEventListener('click',async()=>{try{await session?.send(OPS.RESET_ESTOP);say('緊急停止を解除しました。駆動許可は解除したままです。');}catch(e){say(String(e));}update();});
  for(const id of ['emergency','stop','dpad-stop'])el(id).addEventListener('click',()=>stop(id==='emergency'));
  async function startMotion(name:string){
    if(settings.singleTest&&!['lf','lr','rf','rr'].includes(name))return;
    if(held||!session?.status?.armed||armBlock())return;
    const motionSession=session;
    held=true;
    activeMotion=name;
    const [left,right]=direction(name,Number(input('left-speed').value),Number(input('right-speed').value));
    record(`motion-request:${name}`,undefined,`L=${left}% R=${right}%`);
    try{
      await motionSession.send(OPS.MOVE,left,right);
      const label=buttons.find(button=>button.dataset.motion===name)?.textContent?.trim()??name;
      if(session===motionSession)lastMotion=`直近の指令　${label}　左 ${left}% ／ 右 ${right}%`;
    }catch(error){
      if(held&&session===motionSession){stop();say(String(error));}
    }
    update();
  }
  buttons.forEach(button=>{
    button.addEventListener('pointerdown',e=>{if(e.button!==0||held)return;e.preventDefault();pointerId=e.pointerId;button.setPointerCapture(e.pointerId);void startMotion(button.dataset.motion!);});
    button.addEventListener('pointerup',e=>{if(pointerId===e.pointerId)stop();});button.addEventListener('pointercancel',()=>stop());button.addEventListener('lostpointercapture',()=>{if(held)stop();});
    button.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();void startMotion(button.dataset.motion!);}});button.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();stop();}});
  });
  const arrowDirections:Record<string,string>={ArrowUp:'forward',ArrowDown:'backward',ArrowLeft:'left',ArrowRight:'right'};
  document.addEventListener('keydown',event=>{
    const motion=arrowDirections[event.key];
    if(!motion||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||document.hidden||held||
      event.target instanceof Element&&event.target.closest('input,select,textarea,[contenteditable]'))return;
    const button=buttons.find(control=>control.dataset.motion===motion);
    if(!button||button.disabled)return;
    event.preventDefault();
    if(event.repeat)return;
    heldKey=event.key;
    void startMotion(motion);
  });
  document.addEventListener('keyup',event=>{
    if(heldKey!==event.key)return;
    event.preventDefault();
    stop();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();record('browser-hidden');}});window.addEventListener('blur',()=>{if(session?.connected)stop();});window.addEventListener('pagehide',()=>{stop();session?.disconnect();});
  function settingsChanged(){stop();settings={frequency:Number(input('frequency').value),pulseMs:Number(input('pulse').value),invertLeft:input('invert-left').checked,invertRight:input('invert-right').checked,signalOnly:input('signal-only').checked,singleTest:input('single-test').checked,rcTest:isRcFirmware(session?.status)&&!input('signal-only').checked};if(session)session.settings=settings;el('left-percent').textContent=input('left-speed').value+'%';el('right-percent').textContent=input('right-speed').value+'%';el('check-power').closest('label')!.lastChild!.textContent=settings.singleTest?' 1.5Vは想定・未測定で、部品適合も未確認の短時間試験と理解した':settings.signalOnly?' 信号試験ではVMを物理的に外した':' VM実測値の安定・部品適合・左右同時に必要な電流容量を確認した';update();}
  function applySingleMode(){
    const single=input('single-test').checked,rc=isRcFirmware(session?.status);
    if(rc){input('frequency').value='1000';input('pulse').value='500';for(const side of ['left','right'])input(`${side}-speed`).value='50';}
    if(single){input('signal-only').checked=false;input('frequency').value='1000';input('pulse').value='100';for(const side of ['left','right'])input(`${side}-speed`).value='25';}
    input('signal-only').disabled=single;input('frequency').disabled=single||rc;input('pulse').max=single?'100':'500';
    for(const side of ['left','right']){const speed=input(`${side}-speed`);speed.min=single?'25':'0';speed.max=single||rc?String(RC_MAX_DUTY):'100';speed.step=single?'25':'1';}
    ['check-wiring','check-switch','check-tracks','check-power'].forEach(id=>input(id).checked=false);settingsChanged();
  }
  el('single-test').addEventListener('change',applySingleMode);
  el('signal-only').addEventListener('input',()=>{
    input('check-power').checked=false;
    settingsChanged();
  });
  for(const id of ['frequency','pulse','invert-left','invert-right','left-speed','right-speed'])el(id).addEventListener('input',settingsChanged);
  for(const id of ['check-wiring','check-switch','check-tracks','check-power'])el(id).addEventListener('change',()=>{if(!input(id).checked)stop();update();});
  el('power-form').addEventListener('input',()=>{
    powerRecordDirty=true;
    if(settings.rcTest){
      input('check-power').checked=false;
      if(session?.status?.armed||session?.foregroundBusy)stop();
    }
    update();
  });
  el('power-form').addEventListener('submit',event=>{event.preventDefault();const nullable=(id:string)=>input(id).value===''?null:Number(input(id).value);const measuredAt=input('measured-at').value;const p:PowerRecord={settingV:Number(input('setting-v').value),measuredV:nullable('measured-v'),displayOffSeconds:nullable('display-off'),outputAfterOff:el<HTMLSelectElement>('output-after').value as PowerRecord['outputAfterOff'],motorPowerState:input('motor-power').value||'未確認',heat:el<HTMLSelectElement>('heat').value as PowerRecord['heat'],measuredAt:measuredAt?new Date(measuredAt).toISOString():null};if(!validatePower(p)){say('実測値を入れた場合は測定日時も入力してください。数値と日時を確認してください。');return;}power=p;powerRecordDirty=false;if(power.heat==='present')stop(true);else if(settings.rcTest)stop();record('manual-power-record',undefined,input('result').value||'手入力の診断記録');say('設定値・手動実測値を分けて記録しました。自動測定は行っていません。');update();});
  function download(data:string,type:string,extension:string){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=`colon-motor-${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  el('export-json').addEventListener('click',()=>{record('export-json');download(JSON.stringify({schema:'colon-motor-diagnostics/1',unmeasured:['smartcobyInternalV','dcdcInputV','dcdcOutputVAuto','motorCurrent','lowLoadDecision'],logs},null,2),'application/json','json');});
  el('export-csv').addEventListener('click',()=>{record('export-csv');download(toCSV(logs),'text/csv;charset=utf-8','csv');});
  el('mock-disconnect').addEventListener('click',()=>{if(session?.transport instanceof MockTransport)session.transport.disconnect();update();});
  el('mock-reboot').addEventListener('click',()=>{if(session?.transport instanceof MockTransport){session.transport.reboot();record('mock-reboot');void session.poll();}});
  setInterval(()=>{void session?.poll();update();},150);
  setInterval(async()=>{if(heartbeatBusy||document.hidden||!session?.connected||session.busy||(session.transport.kind==='mock'&&input('pause-heartbeat').checked))return;heartbeatBusy=true;try{await session.heartbeat();}catch(e){say(String(e));}finally{heartbeatBusy=false;}},120);
  patternPanel=mountPatternPanel({session:()=>session,blocked:armBlock,stop,say,record});
  mountUsbWriter({beforeConnect:()=>{stop();session?.disconnect();session=null;update();},record});
  document.querySelector('.motor-content')!.prepend(el('rc-control'),document.querySelector('.motor-state')!);
  update();
}
