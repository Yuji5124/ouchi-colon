import {INITIAL_SETTINGS,makeFrame,OPS,type MotorSettings,type MotorStatus,type Op} from './protocol.ts';
import type {Transport} from './transport.ts';
import type {PatternTable} from './patterns.ts';
export class MotorSession {
  status:MotorStatus|null=null;busy=false;connected=false;lastHeartbeatAt:string|null=null;settings:MotorSettings={...INITIAL_SETTINGS};
  onStatus:()=>void=()=>{};onEvent:(event:string,error?:string)=>void=()=>{};
  private generation=0;private sequence=0;private stopPending:Op|null=null;
  readonly transport:Transport;
  constructor(transport:Transport){this.transport=transport;transport.onDisconnect=()=>{this.connected=false;this.status=null;this.generation++;this.onEvent('disconnect');this.onStatus();};}
  private observe(next:MotorStatus){const previous=this.status;this.status=next;if(previous&&next.stopReason!==previous.stopReason&&!next.armed)this.onEvent(`stopped:${next.stopReason}`);}
  async connect(){await this.transport.connect();this.connected=true;this.status=await this.transport.read();this.sequence=this.status.seq;this.onEvent('connect');this.onStatus();}
  disconnect(){this.generation++;this.connected=false;this.transport.disconnect();this.status=null;this.onStatus();}
  async readPatternTable():Promise<PatternTable>{if(this.busy||!this.connected)throw new Error('接続して通信完了を待ってください。');this.busy=true;try{return await this.bounded(this.transport.readPatterns());}finally{this.busy=false;this.flushStop();this.onStatus();}}
  async bounded<T>(operation:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('通信応答なし。独立停止タイマーが停止させます。')),2000);})]);}finally{clearTimeout(timer!);}}
  async poll(){if(!this.connected||this.busy)return;this.busy=true;try{const previous=this.status;this.observe(await this.bounded(this.transport.read()));if(previous&&previous.bootId!==this.status!.bootId){this.generation++;this.onEvent('restart-detected');this.requestStop();}this.onStatus();}catch(e){this.onEvent('read-error',String(e));this.disconnect();}finally{this.busy=false;this.flushStop();this.onStatus();}}
  async send(op:Op,left=0,right=0,patternDuration?:number){
    if(!this.connected||!this.status)throw new Error('先に接続してください。');
    if(this.busy)throw new Error('通信処理中です。もう一度操作してください。');
    this.busy=true;const generation=this.generation;
    try{
      const before=await this.bounded(this.transport.read());this.observe(before);
      if(generation!==this.generation)throw new Error('操作は停止要求で取り消されました。');
      this.sequence=Math.max(this.sequence,before.seq)+1;
      const frame=makeFrame(before,op,this.sequence,this.settings,left,right);
      if(op===OPS.SAVE_PATTERN){if(!Number.isInteger(patternDuration)||!(patternDuration===0||(patternDuration!>=50&&patternDuration!<=500)))throw new Error('パターン時間は未校正0、または50〜500msです。');new DataView(frame.buffer).setUint16(17,patternDuration!,true);}
      await this.bounded(this.transport.write(frame));
      for(let i=0;i<12;i++){
        const status=await this.bounded(this.transport.read());this.observe(status);
        if(status.nonce!==before.nonce||status.seq>=this.sequence)break;
        await new Promise(resolve=>setTimeout(resolve,15));
      }
      const accepted=this.status.nonce===before.nonce&&this.status.seq>=this.sequence;
      if((op===OPS.ARM&&!this.status.armed)||((op===OPS.MOVE||op===OPS.PATTERN)&&(!accepted||!this.status.armed))||((op===OPS.CONFIG||op===OPS.SAVE_PATTERN)&&!accepted))throw new Error(`ファームウェアが操作を拒否：${this.status.stopReason}`);
      if(op===OPS.HEARTBEAT&&accepted)this.lastHeartbeatAt=new Date().toISOString();
      this.onEvent(Object.entries(OPS).find(([,n])=>n===op)?.[0]??'command');this.onStatus();
    }catch(e){this.onEvent('command-error',String(e));if(op!==OPS.STOP&&op!==OPS.ESTOP&&this.stopPending!==OPS.ESTOP)this.stopPending=OPS.STOP;throw e;}
    finally{this.busy=false;this.flushStop();this.onStatus();}
  }
  requestStop(emergency=false){this.generation++;this.stopPending=emergency?OPS.ESTOP:this.stopPending===OPS.ESTOP?OPS.ESTOP:OPS.STOP;this.flushStop();}
  private flushStop(){if(this.busy||!this.stopPending||!this.connected)return;const op=this.stopPending;this.stopPending=null;void this.send(op).catch(e=>{this.onEvent('stop-unconfirmed',String(e));this.disconnect();});}
}
