import {fetchFirmware,verifyChip,writeBundle,type FirmwareBundle,type LoaderPort} from './usb-writer.ts';
import {loadUsbLibrary,type UsbLibrary} from './usb-library.ts';
const firmwareChoices={
  program:{name:'走行プログラム',path:'program/',kind:'drive-program'},
  notif190:{name:'Notif保存版1.9.0',path:'notif-1.9.0/',kind:'drive-program'},
} as const;
interface Hooks {beforeConnect:()=>void;record:(event:string,error?:string,result?:string)=>void;}
export function mountUsbWriter(hooks:Hooks){
  const section=document.createElement('section');section.className='motor-card usb-writer';section.id='usb-writer';section.innerHTML=`<div class="section-top"><h2>USB-CでAtomS3へ書き込む</h2><span class="badge">PC Chrome / Edge · Web Serial</span></div><p class="subtle">データ通信対応USB-Cケーブルを使用します。初回はAtomS3のリセットを約2秒長押しし、内部の緑LEDが点灯したら離してダウンロードモードにしてください。USB接続操作でも機器がリセットされます。</p><label class="check"><input id="usb-vm-off" type="checkbox"> モーター電源VMと外付け回路を外した</label><label class="check"><input id="usb-board" type="checkbox"> 接続する実機がAtomS3 C123であることを確認した</label><label class="check"><input id="usb-replace" type="checkbox"> 既存ファームを置き換えることと、復元方法を確認した</label><div class="pattern-actions"><button id="usb-connect" class="motor-secondary" disabled>USBを選んで接続（リセット）</button><button id="usb-backup" class="motor-secondary" disabled>既存内容をバックアップ（8MB）</button><button id="usb-disconnect" class="motor-secondary" disabled>USBを切断</button></div><label class="check"><input id="usb-backup-confirmed" type="checkbox"> バックアップ済み、または既存ファームを復元できる</label><button id="usb-write" class="motor-primary" disabled>走行プログラムを書き込む</button><progress id="usb-progress" max="100" value="0"></progress><p id="usb-message" class="motor-feedback" role="status">ファームウェアの準備状態を確認中…</p><button id="usb-reset" class="motor-secondary" disabled>書込み確認後に再起動</button><details><summary>書込みログ</summary><pre id="usb-log"></pre></details><p class="subtle">書込み中はケーブルを抜かないでください。走行プログラムは電池3V・出力100%・時間制御です。書込み後の操作・パターン保存はBLEで行います。iPhone SafariのUSB書込みは未対応です。</p>`;
  section.classList.remove('motor-card');
  const panel=document.createElement('details');
  panel.className='motor-card usb-panel';
  const summary=document.createElement('summary');summary.textContent='AtomS3の書き込み・更新';
  panel.append(summary,section);document.querySelector('.motor-content')!.prepend(panel);
  const reveal=()=>{panel.open=true;};
  panel.open=location.hash==='#usb-writer';
  document.querySelectorAll('a[href="#usb-writer"]').forEach(link=>link.addEventListener('click',reveal));
  window.addEventListener('hashchange',()=>{if(location.hash==='#usb-writer')reveal();});
  const firmwareChoice=document.createElement('label');
  firmwareChoice.innerHTML='<strong>書き込むファーム</strong><select id="usb-firmware-kind"><option value="program">走行プログラム1.9.0（電池3V・共通角度校正）</option><option value="notif190">Notif保存版1.9.0に戻す</option></select>';
  section.querySelector('.check')!.before(firmwareChoice);
  const prerequisite=document.createElement('p');prerequisite.id='usb-prerequisites';prerequisite.className='motor-feedback';prerequisite.setAttribute('role','status');section.querySelector('.pattern-actions')!.before(prerequisite);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>section.querySelector<T>(`#${id}`)!;

  const writeHelp=document.createElement('p');
  writeHelp.id='usb-write-help';
  writeHelp.className='arm-reason';
  writeHelp.setAttribute('role','status');
  el('usb-write').before(writeHelp);
  el('usb-write').setAttribute('aria-describedby',writeHelp.id);
  let bundle:FirmwareBundle|null=null,library:UsbLibrary|null=null,prepareError:string|null=null,loader:LoaderPort|null=null,transport:{disconnect():Promise<void>}|null=null,busy=false,verified=false;
  let preparation=0;
  const kind=()=>el<HTMLSelectElement>('usb-firmware-kind').value as keyof typeof firmwareChoices;
  const msg=(s:string)=>el('usb-message').textContent=s;
  const log=(s:string)=>{el('usb-log').textContent=(el('usb-log').textContent+'\n'+s).slice(-12000);};
  const ready=()=>['usb-vm-off','usb-board','usb-replace'].every(id=>el<HTMLInputElement>(id).checked);
  function writeBlock(){
    if(busy)return 'USB処理中です。完了までお待ちください。';
    if(verified)return '書込みと照合が完了しました。VMを外したまま再起動してください。';
    if(!bundle)return '書込み用ファームの準備状態を確認してください。';
    if(!ready())return 'USB欄の機器・配線・復元の確認項目を確認してください。';
    if(!loader)return '先に「USBを選んで接続」を押してください。';
    if(!el<HTMLInputElement>('usb-backup-confirmed').checked)return 'バックアップ、または復元手段の確認が必要です。';
    return '';
  }

  function update(){
    const selected=kind();
    el<HTMLSelectElement>('usb-firmware-kind').disabled=busy||!!loader;
    el('usb-write').textContent=firmwareChoices[selected].name+(bundle?' '+bundle.manifest.version:'')+'を書き込む';

    const hasSerial=typeof navigator!=='undefined'&&'serial' in navigator&&isSecureContext;
    const missing=['usb-vm-off','usb-board','usb-replace'].filter(id=>!el<HTMLInputElement>(id).checked).length;
    prerequisite.textContent=!hasSerial?'このブラウザはUSB書込み未対応です。PCのChrome / EdgeでこのURLを開いてください。'
      :prepareError?'書込みツールの準備に失敗しました。ページを再読み込みしてください。'
      :!bundle||!library?'ファームとUSB書込みツールを準備しています。USB機器への接続はまだ行いません。'
      :busy?'USBの選択・通信処理中です。画面の案内を確認してください。'
      :loader?'USB接続済みです。バックアップ後に、書込みボタンを別途押してください。'
      :missing?`接続ボタンを使うには、上の確認項目をあと${missing}項目確認してください。ケーブルを挿すだけでは接続は始まりません。`
      :'準備できました。「USBを選んで接続」を押し、表示される一覧からAtomS3を選んでください。';
    const blocked=writeBlock();
    writeHelp.textContent=blocked||'書込みの準備ができました。';
    el<HTMLButtonElement>('usb-write').disabled=!!blocked;
    el<HTMLButtonElement>('usb-connect').disabled=!bundle||!library||!!prepareError||!ready()||busy||!!loader||!hasSerial;
    el<HTMLButtonElement>('usb-backup').disabled=!loader||busy;
    el<HTMLButtonElement>('usb-disconnect').disabled=!loader||busy;
    el<HTMLButtonElement>('usb-reset').disabled=!verified||busy||!loader;
    section.querySelectorAll<HTMLInputElement>('input').forEach(i=>i.disabled=busy);
  }
  async function close(){try{await transport?.disconnect();}catch{}loader=null;transport=null;verified=false;update();}
  section.querySelectorAll('input').forEach(i=>i.addEventListener('change',update));
  async function prepare(){
    const attempt=++preparation,choice=firmwareChoices[kind()];
    bundle=null;prepareError=null;verified=false;msg(`${choice.name}とUSB書込みツールを準備しています…`);update();
    try{
      const [b,l]=await Promise.all([fetchFirmware(`${import.meta.env.BASE_URL}firmware/${choice.path}`),loadUsbLibrary()]);
      if(attempt!==preparation)return;
      if(b.manifest.poweredTests!==choice.kind)throw new Error('選んだファームの種別と配布内容が一致しません。');
      bundle=b;library=l;
      const detail=' 書き込み後はBLE接続して方向キー・動作ボタンで操作できます。';
      msg(`${choice.name} ${b.manifest.version}のSHA-256を確認しました。${detail}`);
    }catch(e){if(attempt!==preparation)return;prepareError=String(e);msg(`書込みツールを読み込めませんでした。ページを再読み込みしてください。${prepareError}`);hooks.record('usb-prepare-error',prepareError);}finally{if(attempt===preparation)update();}
  }
  el('usb-firmware-kind').addEventListener('change',()=>{if(!loader&&!busy)void prepare();});void prepare();
  el('usb-connect').addEventListener('click',async()=>{if(!bundle||!library||!ready()||busy||prepareError)return;busy=true;update();hooks.beforeConnect();
    try{const {ESPLoader,Transport}=library;const serial=(navigator as unknown as {serial:{requestPort():Promise<ConstructorParameters<typeof Transport>[0]>}}).serial;msg('USB機器の選択を待っています。一覧からAtomS3を選んでください。');const port=await serial.requestPort();msg('選択した機器へ接続しています。書込みはまだ行いません。');transport=new Transport(port);loader=new ESPLoader({transport:transport as InstanceType<typeof Transport>,baudrate:115200,terminal:{clean(){el('usb-log').textContent='';},write:log,writeLine:log}}) as unknown as LoaderPort;const chip=await verifyChip(loader);msg(`${chip}にUSB接続しました。チップ識別だけではC123基板の識別はできません。バックアップと書込み対象を確認してください。`);hooks.record('usb-connected',undefined,chip);}
    catch(e){msg(`USB接続できませんでした。${String(e)}`);await close();}finally{busy=false;update();}
  });
  el('usb-backup').addEventListener('click',async()=>{if(!loader||busy)return;busy=true;update();msg('8MBを読み出しています。ケーブルを抜かないでください。');try{const bytes=await loader.readFlash(0,8388608,(_packet:unknown,current:number,total:number)=>{el<HTMLProgressElement>('usb-progress').value=Math.floor(current/total*100);});if(bytes.length!==8388608)throw new Error('読出しサイズが一致しません。');const a=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/octet-stream'}));a.href=url;a.download=`atoms3-backup-${Date.now()}.bin`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);el<HTMLInputElement>('usb-backup-confirmed').checked=true;msg('バックアップをダウンロードしました。機器固有の設定を含むため、このPCで保管してください。');hooks.record('usb-backup-complete');}catch(e){msg(String(e));}finally{busy=false;update();}});
  el('usb-write').addEventListener('click',async()=>{if(writeBlock()||!loader||!bundle)return;busy=true;update();msg('書込み中です。ケーブルを抜かないでください。');try{await writeBundle(loader,bundle,n=>{el<HTMLProgressElement>('usb-progress').value=n;});verified=true;msg('書込みと実機MD5照合が完了しました。VMを外したまま、再起動してください。');hooks.record('usb-flash-verified',undefined,bundle.manifest.version);}catch(e){verified=false;msg(`書込み未完了・内容が一部変わった可能性があります。${String(e)}`);hooks.record('usb-flash-error',String(e));}finally{busy=false;update();}});
  el('usb-reset').addEventListener('click',async()=>{if(!verified||!loader||busy)return;busy=true;update();try{await loader.after('hard_reset');msg('再起動を要求しました。USBを切断してBLEへ接続し、版と停止状態を確認してください。');}catch(e){msg(`再起動要求の結果は未確認です。VMを外したままUSBを抜き差ししてください。${String(e)}`);}finally{busy=false;update();}});
  el('usb-disconnect').addEventListener('click',()=>void close());
  update();
  return {update};
}
