import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
export class MotorWorker {
  child=null;pending=null;seq=0;
  constructor(python=process.env.COLON_MOTOR_PYTHON||resolve(root,'work/notif-motor-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python')){this.python=python;}
  start(){
    if(this.child)return;
    const child=spawn(this.python,['-u',resolve(root,'local-server/motor_ble.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
    const fail=()=>{if(this.child!==child)return;this.child=null;this.pending?.reject(new Error('モーター接続エンジンが停止しました。Python/Bleakの導入を確認してください。'));this.pending=null;};
    child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);child.stderr.on('data',()=>{});
    createInterface({input:child.stdout}).on('line',line=>{try{const result=JSON.parse(line);if(result.id===this.pending?.id){const p=this.pending;this.pending=null;result.error?p.reject(new Error(result.error)):p.resolve(result.result);}}catch{fail();child.kill();}});
  }
  async request(op,payload={}){
    if(this.pending)throw new Error('サーバーの通信処理中です。');this.start();
    const id=++this.seq;let timer;
    try{return await new Promise((resolve,reject)=>{this.pending={id,resolve,reject};timer=setTimeout(()=>{this.pending=null;this.child?.kill();this.child=null;reject(new Error('モーターサーバーの応答がありません。接続し直してください。'));},op==='scan'?8000:op==='connect'?13000:2200);this.child.stdin.write(JSON.stringify({id,op,...payload})+'\n',error=>{if(error&&this.pending?.id===id){this.pending=null;reject(error);}});});}
    finally{clearTimeout(timer);}
  }
  close(){this.child?.kill();this.child=null;this.pending?.reject(new Error('サーバーを終了しました。'));this.pending=null;}
}
export function createMotorExtension({token,worker=new MotorWorker(),dist=resolve(root,'dist')}={}){
 let connection=null,lastSeen=0;
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 return {close:()=>worker.close(),async handle(req,res,url){
   if(url.pathname.startsWith('/ouchi-colon/')){
     if(req.method!=='GET')return json(res,405,{error:'GET only'});
     let relative;try{relative=decodeURIComponent(url.pathname.slice('/ouchi-colon/'.length));}catch{return json(res,400,{error:'Bad path'});}
     const base=resolve(dist),path=resolve(base,relative||'index.html');
     if(path!==base&&!path.startsWith(base+sep))return json(res,403,{error:'Bad path'});
     try{if(!(await stat(path)).isFile())throw Error();const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.bin':'application/octet-stream','.webmanifest':'application/manifest+json'};res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});const content=await readFile(path);res.end(extname(path)==='.html'?content.toString('utf8').replace('</head>','<meta name="colon-motor-host" content="notif"></head>'):content);}catch{json(res,404,{error:'モーター画面のビルドがありません。OuchiColonでnpm run buildを実行してください。'});}return;
   }
   if(!url.pathname.startsWith('/api/motor/'))return false;
   if(req.method!=='POST'||req.headers['x-colon-token']!==token){json(res,403,{error:'画面を再読み込みしてください。'});return true;}
   try{
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('リクエストが大きすぎます。');}
     const body=JSON.parse(raw||'{}'),op=url.pathname.slice('/api/motor/'.length);
     if(!['scan','connect','disconnect','read','patterns','write'].includes(op))throw Error('未対応の操作です。');
     if((op==='scan'||op==='connect')&&connection&&Date.now()-lastSeen>5000){await worker.request('disconnect');connection=null;}
     if((op==='scan'||op==='connect')&&connection)throw Error('他の画面がAtomを使用中です。接続した画面で切断してください。');
     if(!['scan','connect'].includes(op)&&(!connection||body.connection!==connection))throw Error('接続が無効です。接続し直してください。');
     if(op==='write'&&(!Array.isArray(body.frame)||body.frame.length!==20||body.frame.some(x=>!Number.isInteger(x)||x<0||x>255)||body.frame[0]!==1||body.frame[1]<1||body.frame[1]>10))throw Error('不正な指令です。');
     const result=await worker.request(op,op==='write'?{frame:body.frame}:op==='connect'?{device:body.device}:{});
     if(op==='connect')connection=randomUUID();if(op==='disconnect')connection=null;lastSeen=Date.now();
     json(res,200,{result,connection});
   }catch(error){json(res,502,{error:error.message});}return true;
 }};
}
