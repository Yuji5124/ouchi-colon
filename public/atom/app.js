import { fetch } from './bridge-editor.js';
const $ = id => document.getElementById(id);
const themes = {mint:['#d9f1df','#174e38'],dark:['#14231d','#ffffff'],paper:['#f4f4ec','#22392d'],blue:['#204d8a','#ffffff'],amber:['#f4b94e','#4b3516']};
const canvas = $('preview'), ctx = canvas.getContext('2d');
let draft = {kind:'text',text:'こんにちは！',size:16,align:'center',theme:'mint',fit:'contain'};
let activeTab='text', picture=null, imageLoading=false, valid=true, busy=false, token='', devices=[], selected='', online=false, pollBusy=false, startupTimer=null, loadSequence=0;
let saved=[];
try { saved=JSON.parse(localStorage.getItem('colon-atom-presets')||'[]').map(validatePreset).slice(0,12); } catch {saved=[];}
function feedback(message,type='') {$('feedback').textContent=message;$('feedback').className=`feedback ${type}`;}
function updateButtons() {
  const ready=devices.some(d=>String(d.number)===selected) && online && !!token;
  $('send').disabled=busy||!valid||!ready||imageLoading;
  $('clear').disabled=busy||!ready;
  $('device').disabled=busy||!devices.length;
  $('send').textContent=busy?'送信中…':'ATOMに送信 ↗';
  $('save').disabled=imageLoading||!valid||busy;
  $('connect').disabled=busy;
  $('target-name').textContent=devices.find(d=>String(d.number)===selected)?.name || '未接続';
}
function wrapText(text,width) {
  const lines=[];
  for (const paragraph of text.split('\n')) {
    let line='';
    for (const char of Array.from(paragraph)) {if (line && ctx.measureText(line+char).width>width) {lines.push(line);line=char;} else line+=char;}
    lines.push(line);
  }
  return lines;
}
function render() {
  const [bg,fg]=themes[draft.theme];ctx.fillStyle=bg;ctx.fillRect(0,0,128,128);valid=true;
  let warning='';
  if (draft.kind==='text') {
    ctx.font=`500 ${draft.size}px "Yu Gothic", "Hiragino Sans", Meiryo, sans-serif`;
    const lines=wrapText(draft.text,112), lineHeight=draft.size*1.4;
    const count=Array.from(draft.text).length;
    if (!draft.text.trim()) {valid=false;warning='表示する文字を入力してください。';}
    else if(count>200) {valid=false;warning='メッセージは200文字以内にしてください。';}
    else if(lines.length*lineHeight>112){valid=false;warning='画面に収まりません。文字を小さくするか、短い文にしてください。';}
    ctx.save();ctx.beginPath();ctx.rect(0,0,128,128);ctx.clip();ctx.fillStyle=fg;ctx.textAlign=draft.align;ctx.textBaseline='middle';
    lines.forEach((line,i)=>ctx.fillText(line,draft.align==='center'?64:8,64+(i-(lines.length-1)/2)*lineHeight));ctx.restore();
  } else if(picture) {
    ctx.fillStyle='#000';ctx.fillRect(0,0,128,128);
    const ratio=draft.fit==='cover'?Math.max(128/picture.width,128/picture.height):Math.min(128/picture.width,128/picture.height);
    const w=draft.fit==='fill'?128:picture.width*ratio,h=draft.fit==='fill'?128:picture.height*ratio;
    ctx.drawImage(picture,(128-w)/2,(128-h)/2,w,h);
  } else {valid=false;warning=imageLoading?'画像を読み込んでいます…':'表示する画像を選んでください。';}
  $('preview-warning').textContent=warning;
  $('count').textContent=`${Array.from(draft.text).length} / 200文字`;
  updateButtons();
}
function syncInputs() {
  $('message').value=draft.text;$('text-size').value=draft.size;$('fit').value=draft.fit;
  document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===draft.theme)));
  document.querySelectorAll('[data-align]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.align===draft.align)));
}
function setTab(tab) {
  activeTab=tab;
  document.querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;$(`panel-${b.dataset.tab}`).hidden=!on;});
  if(tab!=='saved')draft.kind=tab;
  if(tab==='saved')renderSaved();
  render();
}
document.querySelectorAll('[data-tab]').forEach(b=>{
  b.addEventListener('click',()=>setTab(b.dataset.tab));
  b.addEventListener('keydown',e=>{const tabs=['text','image','saved'];let i=tabs.indexOf(activeTab);if(e.key==='ArrowRight')i=(i+1)%3;else if(e.key==='ArrowLeft')i=(i+2)%3;else if(e.key==='Home')i=0;else if(e.key==='End')i=2;else return;e.preventDefault();setTab(tabs[i]);$(`tab-${tabs[i]}`).focus();});
});
$('message').addEventListener('input',()=>{draft.text=$('message').value;render();});
$('text-size').addEventListener('change',()=>{draft.size=Number($('text-size').value);render();});
$('fit').addEventListener('change',()=>{draft.fit=$('fit').value;render();});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{draft.text=b.dataset.preset;$('message').value=draft.text;render();}));
document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>{draft.theme=b.dataset.theme;syncInputs();render();}));
document.querySelectorAll('[data-align]').forEach(b=>b.addEventListener('click',()=>{draft.align=b.dataset.align;syncInputs();render();}));
async function loadImage(source) {
  const generation=++loadSequence;imageLoading=true;picture=null;render();
  try {const img=new Image();img.src=source;await img.decode();if(generation!==loadSequence)return;if(img.width*img.height>40000000)throw new Error('解像度が高すぎます。40メガピクセル以下の画像を選んでください。');picture=img;}
  catch(e){if(generation===loadSequence)feedback(e.message||'画像を読み込めませんでした。','error');}
  finally{if(generation===loadSequence){imageLoading=false;render();}}
}
async function chooseFile(file) {
  if(!file)return;
  if(file.size>10*1024*1024||!['image/png','image/jpeg','image/webp','image/bmp','image/x-ms-bmp'].includes(file.type)){feedback('PNG / JPEG / WebP / BMPの画像を10MB以内で選んでください。','error');return;}
  const url=URL.createObjectURL(file);$('file-name').textContent=file.name;draft.kind='image';
  try{await loadImage(url);}finally{URL.revokeObjectURL(url);}
}
$('image-file').addEventListener('change',e=>chooseFile(e.target.files[0]));
const upload=document.querySelector('.upload');
upload.addEventListener('dragover',e=>{e.preventDefault();upload.classList.add('dragover');});
upload.addEventListener('dragleave',()=>upload.classList.remove('dragover'));
upload.addEventListener('drop',e=>{e.preventDefault();upload.classList.remove('dragover');chooseFile(e.dataTransfer.files[0]);});
function validatePreset(p) {
  if(!p||!['text','image'].includes(p.kind)||typeof p.name!=='string'||p.name.length>30||typeof p.text!=='string'||Array.from(p.text).length>200||![12,16,24,32].includes(p.size)||!Object.hasOwn(themes,p.theme)||!['left','center'].includes(p.align)||!['contain','cover','fill'].includes(p.fit))throw new Error('保存ファイルの形式が違います。');
  if(p.kind==='image'&&(typeof p.image!=='string'||p.image.length>200000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.image)))throw new Error('画像データの形式が違います。');
  return {name:p.name,kind:p.kind,text:p.text,size:p.size,theme:p.theme,align:p.align,fit:p.fit,...(p.kind==='image'?{image:p.image}:{})};
}
function persistPresets(next) {try{localStorage.setItem('colon-atom-presets',JSON.stringify(next));saved=next;return true;}catch{feedback('ブラウザに保存できませんでした。空き容量や保存設定を確認してください。','error');return false;}}
$('save').addEventListener('click',()=>{
  if(!valid)return;
  const name=$('save-name').value.trim();if(!name){feedback('保存する名前を入力してください。');$('save-name').focus();return;}
  if(saved.length>=12&&!saved.some(p=>p.name===name)){feedback('保存は12件までです。不要な表示を削除してください。','error');return;}
  const item=validatePreset({...draft,name,...(draft.kind==='image'?{image:canvas.toDataURL('image/png'),fit:'fill'}:{})});
  const next=saved.filter(p=>p.name!==name);next.push(item);
  if(persistPresets(next)){feedback(`「${name}」をこのブラウザに保存しました。`,'success');renderSaved();}
});
function renderSaved() {
  const list=$('saved-list');list.replaceChildren();
  if(!saved.length){const empty=document.createElement('p');empty.className='saved-empty';empty.textContent='まだ保存した表示はありません。\n名前を付けて保存すると、ここから呼び出せます。';list.append(empty);return;}
  saved.forEach((p,index)=>{
    const row=document.createElement('div');row.className='saved-item';
    const load=document.createElement('button');load.className='load-saved';load.textContent=`${p.kind==='text'?'T':'▧'}　${p.name}`;
    load.addEventListener('click',async()=>{draft={...p};syncInputs();setTab(p.kind);$('save-name').value=p.name;if(p.kind==='image'){await loadImage(p.image);$('file-name').textContent=`保存した画像：${p.name}`;}feedback(`「${p.name}」を読み込みました。送信はまだしていません。`);});
    const remove=document.createElement('button');remove.className='remove-saved';remove.textContent='削除';remove.setAttribute('aria-label',`${p.name}を保存から削除`);
    remove.addEventListener('click',()=>{if(persistPresets(saved.filter((_,i)=>i!==index)))renderSaved();});row.append(load,remove);list.append(row);
  });
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').addEventListener('click',()=>{download(new Blob([JSON.stringify({app:'colon-atom',version:1,presets:saved},null,2)],{type:'application/json'}),'colon-atom-presets.json');feedback('保存した表示をファイルに書き出しました。');});
$('import-file').addEventListener('change',async e=>{
  try{const file=e.target.files[0];if(!file)return;if(file.size>3000000)throw new Error('保存ファイルが大きすぎます。');const data=JSON.parse(await file.text());if(data.app!=='colon-atom'||data.version!==1||!Array.isArray(data.presets)||data.presets.length>12)throw new Error('Colon Atomの保存ファイルを選んでください。');const items=data.presets.map(validatePreset),next=[...saved];for(const item of items){let i=next.findIndex(p=>p.name===item.name);if(i<0)next.push(item);else next[i]=item;}if(next.length>12)throw new Error('保存件数が12件を超えます。不要な表示を先に削除してください。');if(persistPresets(next)){renderSaved();feedback(`${items.length}件を読み込みました。実機には送信していません。`,'success');}}
  catch(err){feedback(err.message,'error');}finally{e.target.value='';}
});
async function refresh() {
  if(pollBusy)return;pollBusy=true;
  try {
    const r=await fetch('/api/status',{signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error();const s=await r.json();online=s.online===true;devices=s.devices||[];
    if(!devices.some(d=>String(d.number)===selected))selected=devices.length===1?String(devices[0].number):'';
    $('device').replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=devices.length?'送信先を選んでください':'接続先がありません';$('device').append(placeholder);
    for(const d of devices){const opt=document.createElement('option');opt.value=String(d.number);opt.textContent=d.name;$('device').append(opt);}$('device').value=selected;
    $('connection-title').textContent=devices.length?`${devices.length}台のATOMに接続中`:online?'ATOMを探しています':'ATOMを接続する';
    $('connection-message').textContent=devices.length?'送信するATOMを選んでください。':online?'電源と対応ファームを確認してください。見つかった機器は自動で表示されます。':s.starting?'接続サーバーを起動しています。しばらくお待ちください。':'接続をはじめると、このPCのBluetoothでATOMを探します。';
    $('connect').textContent=online?'接続を更新':'接続をはじめる';
    $('server-info').textContent=online?`接続サーバー：Notif ${s.version} / このPCのみ`:'接続サーバー：停止中、または応答なし';
    if(online&&startupTimer){clearTimeout(startupTimer);startupTimer=null;}
  } catch {online=false;devices=[];selected='';$('device').replaceChildren(new Option('接続先がありません',''));$('connection-title').textContent='アプリとの接続が途切れました';$('connection-message').textContent='起動ウィンドウを確認し、画面を再読み込みしてください。';}
  finally{pollBusy=false;updateButtons();}
}
$('device').addEventListener('change',()=>{selected=$('device').value;updateButtons();});
$('connect').addEventListener('click',async()=>{
  if(online){await refresh();feedback(devices.length?'接続状態を更新しました。':'対応するATOMがまだ見つかりません。電源とファームを確認してください。');return;}
  try{if(!token)throw new Error('画面を再読み込みしてください。');const r=await fetch('/api/start',{method:'POST',headers:{'X-Colon-Token':token},signal:AbortSignal.timeout(10000)});const result=await r.json();if(!r.ok)throw new Error(result.error);feedback('接続サーバーを起動しました。ATOMが見つかるまでお待ちください。');await refresh();clearTimeout(startupTimer);startupTimer=setTimeout(()=>{if(!online)feedback('接続サーバーの起動を確認できません。PCのBluetoothとwork/notif-server.logを確認してください。','error');},35000);}
  catch(e){feedback(e.message,'error');}
});
async function send(clear=false) {
  if(busy||!selected||!online||(!clear&&!valid))return;
  busy=true;updateButtons();const target=selected;
  feedback(clear?'ATOMの画面を消しています…':'表示データを送っています。完了するまでお待ちください。');
  try {
    // Snapshot before awaiting: editing never changes the pending transmission.
    const body=clear?undefined:await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!clear&&!body)throw new Error('表示データを作成できませんでした。');
    const r=await fetch(`/api/${clear?'clear':'display'}?device=${encodeURIComponent(target)}`,{method:'POST',headers:{'X-Colon-Token':token,...(!clear?{'Content-Type':'image/png'}:{})},body,signal:AbortSignal.timeout(55000)});
    const data=await r.json();if(!r.ok||data.success!==true)throw new Error(data.error||'送信できませんでした。');
    feedback(`${clear?'画面の消去':'表示データの送信'}をサーバーが完了しました。実機の画面をご確認ください。`,'success');
  } catch(e){feedback(e.name==='TimeoutError'?'応答が途切れました。実機を確認してから再送してください。':e.message,'error');}
  finally{busy=false;updateButtons();await refresh();}
}
$('send').addEventListener('click',()=>send());$('clear').addEventListener('click',()=>send(true));
syncInputs();render();renderSaved();
try{const r=await fetch('/api/session');const data=await r.json();token=data.token||'';}catch{feedback('アプリとの接続に失敗しました。画面を再読み込みしてください。','error');}
await refresh();setInterval(()=>{if(!document.hidden)refresh();},3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

