import {INITIAL_SETTINGS,makeFrame,OPS,type MotorSettings,type MotorStatus,type Op} from './protocol.ts';
import type {Transport} from './transport.ts';
import type {PatternTable} from './patterns.ts';
import {PATTERN_IDS,validPattern} from './patterns.ts';
export class MotorSession {
  status:MotorStatus|null=null;busy=false;connected=false;lastHeartbeatAt:string|null=null;settings:MotorSettings={...INITIAL_SETTINGS};
  onStatus:()=>void=()=>{};onEvent:(event:string,error?:string)=>void=()=>{};
  private generation=0;private sequence=0;private stopPending:Op|null=null;
  private foregroundReserved=false;private wireIsBackground=false;
  private idleWaiters=new Set<()=>void>();
  /** User controls stay stable while periodic telemetry/heartbeat is in flight. */
  get foregroundBusy(){return this.foregroundReserved||(this.busy&&!this.wireIsBackground)||this.stopPending!==null;}
  readonly transport:Transport;
  constructor(transport:Transport){this.transport=transport;transport.onDisconnect=()=>{this.connected=false;this.status=null;this.generation++;this.signalIdle();this.onEvent('disconnect');this.onStatus();};}
  private observe(next:MotorStatus){const previous=this.status;this.status=next;if(previous&&next.stopReason!==previous.stopReason&&!next.armed)this.onEvent(`stopped:${next.stopReason}`);}
  async connect(){await this.transport.connect();this.connected=true;this.status=await this.transport.read();this.sequence=this.status.seq;this.onEvent('connect');this.onStatus();}
  disconnect(){this.generation++;this.connected=false;this.transport.disconnect();this.status=null;this.signalIdle();this.onStatus();}
  private signalIdle(){for(const resolve of this.idleWaiters)resolve();this.idleWaiters.clear();}
  private releaseWire(){this.busy=false;this.flushStop();this.signalIdle();this.onStatus();}
  private async foreground<T>(operation:(assertCurrent:()=>void)=>Promise<T>):Promise<T>{
    if(!this.connected)throw new Error('先に接続してください。');
    if(this.foregroundReserved)throw new Error('読み込み・書込み処理の完了を待ってください。');
    const generation=this.generation;
    const assertCurrent=()=>{if(!this.connected||generation!==this.generation)throw new Error('停止・切断要求により操作を取り消しました。');};
    this.foregroundReserved=true;this.onStatus();
    try{
      // Reserve the next free slot. Background work cannot steal it between frames.
      while(this.busy||this.stopPending){
        assertCurrent();let wake!:()=>void;
        try{await this.bounded(new Promise<void>(resolve=>{wake=resolve;this.idleWaiters.add(wake);}));}
        finally{this.idleWaiters.delete(wake);}
      }
      assertCurrent();const result=await operation(assertCurrent);assertCurrent();return result;
    }finally{this.foregroundReserved=false;this.flushStop();this.signalIdle();this.onStatus();}
  }
  private async readPatternsNow():Promise<PatternTable>{
    if(this.busy||!this.connected)throw new Error('接続して通信完了を待ってください。');
    this.busy=true;this.wireIsBackground=false;
    try{return await this.bounded(this.transport.readPatterns());}
    catch(e){this.onEvent('patterns-read-error',String(e));this.disconnect();throw e;}
    finally{this.releaseWire();}
  }
  async readPatternTable():Promise<PatternTable>{return this.foreground(async()=>this.readPatternsNow());}
  async savePatternTable(table:PatternTable,progress:(count:number)=>void=()=>{}):Promise<PatternTable>{
    const snapshot=structuredClone(table);
    if(!PATTERN_IDS.every(id=>validPattern(id,snapshot[id])))throw new Error('パターンの出力・時間が不正です。');
    return this.foreground(async assertCurrent=>{
      if(this.status?.armed)throw new Error('許可を解除してから書き込んでください。');
      for(let i=0;i<PATTERN_IDS.length;i++){
        assertCurrent();const p=snapshot[PATTERN_IDS[i]];
        await this.sendNow(OPS.SAVE_PATTERN,i,p.speed,p.durationMs);assertCurrent();progress(i+1);
      }
      assertCurrent();const readback=await this.readPatternsNow();assertCurrent();
      if(JSON.stringify(readback)!==JSON.stringify(snapshot))throw new Error('読戻しが一致しません。Atomから読み込んで確認してください。');
      return readback;
    });
  }
  async arm(){return this.foreground(async assertCurrent=>{await this.sendNow(OPS.CONFIG);assertCurrent();await this.sendNow(OPS.ARM);});}
  async bounded<T>(operation:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('通信応答なし。独立停止タイマーが停止させます。')),2000);})]);}finally{clearTimeout(timer!);}}
  async poll(){if(!this.connected||this.busy||this.foregroundReserved)return;this.busy=true;this.wireIsBackground=true;try{const previous=this.status;this.observe(await this.bounded(this.transport.read()));if(previous&&previous.bootId!==this.status!.bootId){this.generation++;this.onEvent('restart-detected');this.requestStop();}this.onStatus();}catch(e){this.onEvent('read-error',String(e));this.disconnect();}finally{this.releaseWire();}}
  async heartbeat(){if(!this.connected||this.busy||this.foregroundReserved)return;await this.sendNow(OPS.HEARTBEAT);}
  async send(op:Op,left=0,right=0,patternDuration?:number){
    // Motion commands are never queued behind a read/save operation.
    if(this.foregroundReserved)throw new Error('読み込み・書込み中です。動作要求は送信していません。');
    return this.sendNow(op,left,right,patternDuration);
  }
  private async sendNow(op:Op,left=0,right=0,patternDuration?:number){
    if(!this.connected||!this.status)throw new Error('先に接続してください。');
    if(this.busy)throw new Error('通信処理中です。もう一度操作してください。');
    this.busy=true;this.wireIsBackground=op===OPS.HEARTBEAT;const generation=this.generation;
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
    }catch(e){this.onEvent('command-error',String(e));if(op!==OPS.STOP&&op!==OPS.ESTOP){this.generation++;if(this.stopPending!==OPS.ESTOP)this.stopPending=OPS.STOP;this.signalIdle();}throw e;}
    finally{this.releaseWire();}
  }
  requestStop(emergency=false){this.generation++;this.stopPending=emergency?OPS.ESTOP:this.stopPending===OPS.ESTOP?OPS.ESTOP:OPS.STOP;this.signalIdle();this.flushStop();}
  private flushStop(){if(this.busy||!this.stopPending||!this.connected)return;const op=this.stopPending;this.stopPending=null;void this.sendNow(op).catch(e=>{this.onEvent('stop-unconfirmed',String(e));this.disconnect();});}
}
