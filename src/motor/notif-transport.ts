import {parseStatus,type MotorStatus} from './protocol.ts';
import {parsePatterns,type PatternTable} from './patterns.ts';
import type {Transport} from './transport.ts';
export class NotifTransport implements Transport {
 kind='notif' as const;onDisconnect=()=>{};private token='';private connection:string|null=null;private version:1|2|3|4|5|6|7|undefined;
 private async call(op:string,payload:Record<string,unknown>={}){
   const response=await fetch('/api/motor/'+op,{method:'POST',headers:{'Content-Type':'application/json','x-colon-token':this.token},body:JSON.stringify({connection:this.connection,...payload}),signal:AbortSignal.timeout(op==='scan'?9000:op==='connect'?14000:2500)});
   const data=await response.json();if(!response.ok||data.error)throw new Error(data.error||'Notifサーバーの接続に失敗しました。');return data;
 }
 async connect(){
   let session;try{const response=await fetch('/api/session',{signal:AbortSignal.timeout(2500)});session=await response.json();}catch{throw new Error('Notifのローカル画面から開いてください。サーバーを起動し、http://127.0.0.1:18180/ouchi-colon/?motor=1&transport=notif を開きます。');}
   if(typeof session.token!=='string')throw new Error('Notifサーバーのセッションを確認できません。');this.token=session.token;
   const devices=(await this.call('scan')).result as Array<{id:string;name:string}>;
   if(!devices.length)throw new Error('モーター用Atomが見つかりません。通常起動・PCのBluetooth・他画面の切断を確認してください。');
   const device=await chooseNotifDevice(devices);
   const result=await this.call('connect',{device});this.connection=result.connection;const status=parseStatus(result.result);this.version=status.patternsVersion;
 }
 disconnect(){if(this.connection){void this.call('disconnect').catch(()=>{});this.connection=null;}this.onDisconnect();}
 async read():Promise<MotorStatus>{try{return parseStatus((await this.call('read')).result);}catch(error){this.disconnect();throw error;}}
 async write(frame:Uint8Array){await this.call('write',{frame:Array.from(frame)});}
 async readPatterns():Promise<PatternTable>{return parsePatterns((await this.call('patterns')).result,this.version);}
}
function chooseNotifDevice(devices:Array<{id:string;name:string}>):Promise<string>{
 return new Promise((resolve,reject)=>{
  const dialog=document.createElement('dialog'),title=document.createElement('h2'),select=document.createElement('select'),connect=document.createElement('button'),cancel=document.createElement('button');
  title.textContent='サーバーが見つけたAtomを選択';select.setAttribute('aria-label','接続するAtom');
  for(const device of devices)select.add(new Option(device.name+' · '+device.id,device.id));
  connect.textContent='このAtomに接続';cancel.textContent='キャンセル';connect.className='motor-primary';cancel.className='motor-secondary';
  const close=()=>{dialog.close();dialog.remove();};connect.onclick=()=>{const id=select.value;close();resolve(id);};cancel.onclick=()=>{close();reject(new Error('接続を取り消しました。'));};dialog.addEventListener('cancel',()=>{dialog.remove();reject(new Error('接続を取り消しました。'));},{once:true});dialog.append(title,select,connect,cancel);document.body.append(dialog);dialog.showModal();
 });
}
