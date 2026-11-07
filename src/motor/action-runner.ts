import {freshFace,planAction,type ActionId,type ActionSettings,type FacePose} from './actions.ts';
import type {MotorSession} from './session.ts';
import {isActionFirmware} from './protocol.ts';

export interface ActionRunnerHooks {
  session:()=>MotorSession|null;
  face:()=>FacePose|null;
  speak:(text:string,signal:AbortSignal)=>Promise<void>;
  speechReady:()=>string;
  changed:()=>void;
  sleep?:(ms:number,signal:AbortSignal)=>Promise<void>;
  now?:()=>number;
}
export function abortDelay(ms:number,signal:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new Error('動作を取り消しました。'));return;}
    const abort=()=>{clearTimeout(timer);reject(new Error('動作を取り消しました。'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}
export class ActionRunner {
  active:ActionId|null=null;step=0;total=0;
  private aborter:AbortController|null=null;
  private readonly sleep:(ms:number,signal:AbortSignal)=>Promise<void>;
  private readonly now:()=>number;
  private readonly hooks:ActionRunnerHooks;
  constructor(hooks:ActionRunnerHooks){this.hooks=hooks;this.sleep=hooks.sleep??abortDelay;this.now=hooks.now??Date.now;}
  get running(){return this.active!==null;}
  stop(emergency=false){
    this.aborter?.abort();
    this.hooks.session()?.requestStop(emergency);
  }
  async run(id:ActionId,settings:ActionSettings,manualMs=500){
    if(id==='A17'){this.stop();return;}
    if(this.running)throw new Error('動作中です。停止後に実行してください。');
    const session=this.hooks.session();
    if(!session?.connected||!session.status)throw new Error('AtomS3へ接続してください。');
    if(!isActionFirmware(session.status))throw new Error('動作連動には走行プログラム1.7.0が必要です。');
    const boot=session.status.bootId,aborter=new AbortController(),signal=aborter.signal;
    const assertCurrent=()=>{
      if(signal.aborted||!session.connected||session!==this.hooks.session()||session.status?.bootId!==boot)throw new Error('停止・切断・再起動により動作を取り消しました。');
      if(session.status.estop||!session.status.gpioReady)throw new Error('本体が停止状態です。');
    };
    this.aborter=aborter;this.active=id;this.step=0;this.total=0;this.hooks.changed();
    try{
      const table=await session.readPatternTable();assertCurrent();
      const plan=planAction(id,table,settings,this.hooks.face(),manualMs,this.now());
      if(plan.speech){const blocked=this.hooks.speechReady();if(blocked)throw new Error(blocked);}
      this.total=plan.moves.length;this.hooks.changed();
      for(const [index,move] of plan.moves.entries()){
        assertCurrent();
        if(plan.requiresFace&&!freshFace(this.hooks.face(),this.now()))throw new Error('顔を見失ったため停止しました。');
        this.step=index+1;this.hooks.changed();
        const deadline=this.now()+move.durationMs+3000;
        await session.driveTimed(move.left,move.right,move.durationMs);
        for(;;){
          assertCurrent();
          if(plan.requiresFace&&!freshFace(this.hooks.face(),this.now()))throw new Error('顔を見失ったため停止しました。');
          const status=session.status!;
          if(!status.armed&&status.left===0&&status.right===0){
            if(status.stopReason!=='pulse-limit')throw new Error('本体が停止しました。'+status.stopReason);
            break;
          }
          if(this.now()>deadline)throw new Error('停止応答を確認できないため中断しました。');
          await this.sleep(40,signal);
        }
        if(index<plan.moves.length-1)await this.sleep(move.gapMs,signal);
      }
      assertCurrent();
      if(plan.speech){const blocked=this.hooks.speechReady();if(blocked)throw new Error(blocked);await this.hooks.speak(plan.speech,signal);}
    }catch(error){
      const needsStop=!signal.aborted;
      aborter.abort();
      if(needsStop&&session.connected)session.requestStop();
      throw error;
    }finally{
      this.aborter=null;this.active=null;this.step=0;this.total=0;this.hooks.changed();
    }
  }
}
