import {INITIAL_SETTINGS,isDirectFirmware,makeFrame,OPS,type MotorSettings,type MotorStatus,type Op} from './protocol.ts';
import type {Transport} from './transport.ts';
import type {PatternTable,PatternId,PatternConfig} from './patterns.ts';
import {fixedProgram,patternIds,validPattern} from './patterns.ts';
export class MotorSession {
  status:MotorStatus|null=null;busy=false;connected=false;lastHeartbeatAt:string|null=null;settings:MotorSettings={...INITIAL_SETTINGS};
  onStatus:()=>void=()=>{};onEvent:(event:string,error?:string)=>void=()=>{};
  private generation=0;private sequence=0;private stopPending:Op|null=null;
  private stopInFlight:Op|null=null;
  private foregroundReserved=false;private wireIsBackground=false;
  private pendingHeartbeat:{nonce:number;seq:number}|null=null;
  private stoppedObservedAt=0;
  private idleWaiters=new Set<()=>void>();
  /** User controls stay stable while periodic telemetry/heartbeat is in flight. */
  get foregroundBusy(){return this.foregroundReserved||(this.busy&&!this.wireIsBackground)||this.stopPending!==null;}
  readonly transport:Transport;
  constructor(transport:Transport){this.transport=transport;transport.onDisconnect=()=>{this.connected=false;this.status=null;this.generation++;this.signalIdle();this.onEvent('disconnect');this.onStatus();};}
  private observe(next:MotorStatus){
    const previous=this.status;this.status=next;
    if(!next.armed&&next.left===0&&next.right===0&&
      (!previous||previous.armed||previous.nonce!==next.nonce||previous.bootId!==next.bootId)){
      this.stoppedObservedAt=performance.now();
    }
    if(this.pendingHeartbeat){
      if(next.nonce!==this.pendingHeartbeat.nonce)this.pendingHeartbeat=null;
      else if(next.seq>=this.pendingHeartbeat.seq){
        if(next.heartbeatAgeMs<350){
          this.lastHeartbeatAt=new Date().toISOString();
          this.onEvent('HEARTBEAT');
        }
        this.pendingHeartbeat=null;
      }
    }
    if(previous&&next.stopReason!==previous.stopReason&&!next.armed)this.onEvent(`stopped:${next.stopReason}`);
  }
  async connect(){await this.transport.connect();this.connected=true;this.status=await this.transport.read();this.stoppedObservedAt=performance.now();this.sequence=this.status.seq;this.onEvent('connect');this.onStatus();}
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
    const ids=patternIds(this.status?.patternsVersion);
    if(!ids.every(id=>validPattern(id,snapshot[id],this.status?.patternsVersion)))throw new Error('パターンの出力・時間が不正です。');
    return this.foreground(async assertCurrent=>{
      if(this.status?.armed)throw new Error('停止してから書き込んでください。');
      for(let i=0;i<ids.length;i++){
        assertCurrent();const p=snapshot[ids[i]];
        await this.sendNow(OPS.SAVE_PATTERN,i,p.speed,p.durationMs);assertCurrent();progress(i+1);
      }
      assertCurrent();const readback=await this.readPatternsNow();assertCurrent();
      if(ids.some(id=>readback[id].speed!==snapshot[id].speed||readback[id].durationMs!==snapshot[id].durationMs))throw new Error('読戻しが一致しません。Atomから読み込んで確認してください。');
      return readback;
    });
  }
  async arm(){return this.foreground(async assertCurrent=>{await this.sendNow(OPS.CONFIG);assertCurrent();await this.sendNow(OPS.ARM);});}
  private async prepareDirectMotion(assertCurrent:()=>void){
    const status=this.status;
    if(!status||!this.settings.directControl||!isDirectFirmware(status))throw new Error('走行プログラム1.7.0へ更新してください。');
    if(status.estop)throw new Error('緊急停止を解除してください。');
    if(status.armed||status.left||status.right)throw new Error('停止してから操作してください。');
    const remaining=100-(performance.now()-this.stoppedObservedAt);
    if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.ceil(remaining)));
    assertCurrent();
  }
  async drive(left:number,right:number){
    return this.foreground(async assertCurrent=>{
      await this.prepareDirectMotion(assertCurrent);
      await this.sendNow(OPS.MOVE,left,right);
    });
  }
  async driveTimed(left:number,right:number,durationMs:number){
    const settings={...this.settings,pulseMs:durationMs,actionStep:true};
    return this.foreground(async assertCurrent=>{
      await this.prepareDirectMotion(assertCurrent);
      await this.sendNow(OPS.MOVE,left,right,undefined,false,settings);
    });
  }
  async runProgram(id:PatternId,expected:PatternConfig){
    const config=structuredClone(expected);
    return this.foreground(async assertCurrent=>{
      const slot=patternIds(this.status?.patternsVersion).indexOf(id);
      if(slot<0||!validPattern(id,config,this.status?.patternsVersion)||config.durationMs===0)throw new Error('旋回時間を設定してAtomへ保存してください。');
      const current=await this.readPatternsNow();
      assertCurrent();
      if(current[id].speed!==config.speed||current[id].durationMs!==config.durationMs)throw new Error('Atomの設定を読み込むか、編集値を保存してください。');
      await this.prepareDirectMotion(assertCurrent);
      await this.sendNow(OPS.PATTERN,slot);
    });
  }
  async bounded<T>(operation:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('通信応答なし。独立停止タイマーが停止させます。')),2000);})]);}finally{clearTimeout(timer!);}}
  async poll(){if(!this.connected||this.busy||this.foregroundReserved)return;this.busy=true;this.wireIsBackground=true;try{const previous=this.status;this.observe(await this.bounded(this.transport.read()));if(previous&&previous.bootId!==this.status!.bootId){this.generation++;this.onEvent('restart-detected');this.requestStop();}this.onStatus();}catch(e){this.onEvent('read-error',String(e));this.disconnect();}finally{this.releaseWire();}}
  async heartbeat(){if(!this.connected||this.busy||this.foregroundReserved)return;await this.sendNow(OPS.HEARTBEAT,0,0,undefined,true);}
  async send(op:Op,left=0,right=0,patternDuration?:number){
    if(this.foregroundReserved)throw new Error('読み込み・書込み中です。動作要求は送信していません。');
    // A held press can wait for an in-flight heartbeat or poll. Stop, release,
    // and disconnect invalidate the reservation before any command is written.
    if(op===OPS.MOVE||op===OPS.PATTERN){
      return this.foreground(async()=>{
        if(!this.status?.armed)throw new Error('停止しました。もう一度試験を許可してください。');
        await this.sendNow(op,left,right);
      });
    }
    return this.sendNow(op,left,right,patternDuration);
  }
  private async sendNow(op:Op,left=0,right=0,patternDuration?:number,backgroundHeartbeat=false,overrideSettings?:MotorSettings){
    if(!this.connected||!this.status)throw new Error('先に接続してください。');
    if(this.busy)throw new Error('通信処理中です。もう一度操作してください。');
    this.busy=true;this.wireIsBackground=op===OPS.HEARTBEAT;const generation=this.generation;
    try{
      // The reserved wire keeps the cached nonce/sequence current for motion.
      // A stale device session still rejects the command without driving.
      const cached=backgroundHeartbeat||op===OPS.MOVE||op===OPS.PATTERN;
      const before=cached?this.status:await this.bounded(this.transport.read());
      if(!cached)this.observe(before);
      if(generation!==this.generation)throw new Error('操作は停止要求で取り消されました。');
      this.sequence=Math.max(this.sequence,before.seq)+1;
      const stop=op===OPS.STOP||op===OPS.ESTOP||op===OPS.DISARM;
      const frame=makeFrame(before,op,this.sequence,stop?INITIAL_SETTINGS:overrideSettings??this.settings,left,right);
      if(op===OPS.SAVE_PATTERN){
        const id=patternIds(before.patternsVersion)[left];
        if(!id||!validPattern(id,{speed:right as 25|50|75|100,durationMs:patternDuration??NaN},before.patternsVersion))throw new Error(fixedProgram(id)?'前進・後進は100%・1000ms固定です。':'パターンの出力・時間が不正です。');
        new DataView(frame.buffer).setUint16(17,patternDuration!,true);
      }
      await this.bounded(this.transport.write(frame));
      if(backgroundHeartbeat){
        if(generation===this.generation)this.pendingHeartbeat={nonce:before.nonce,seq:this.sequence};
        return;
      }
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
  requestStop(emergency=false){
    const op=emergency?OPS.ESTOP:OPS.STOP;
    if(this.stopPending===op||this.stopInFlight===op||this.stopPending===OPS.ESTOP||this.stopInFlight===OPS.ESTOP)return;
    this.generation++;this.stopPending=op;this.signalIdle();this.flushStop();
  }
  private flushStop(){
    if(this.busy||!this.stopPending||!this.connected)return;
    const op=this.stopPending,generation=this.generation;this.stopPending=null;this.stopInFlight=op;
    void this.sendNow(op).catch(e=>{
      // A newer STOP/ESTOP replaces an older stop request; it is not a transport failure.
      if(generation!==this.generation)return;
      this.onEvent('stop-unconfirmed',String(e));this.disconnect();
    }).finally(()=>{if(this.stopInFlight===op)this.stopInFlight=null;});
  }
}
