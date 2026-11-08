import type {MotorSession} from './session.ts';

interface Hooks {
  session:()=>MotorSession|null;
  enabled:()=>boolean;
  heartbeatEnabled?:()=>boolean;
  error:(error:unknown)=>void;
  now?:()=>number;
}
/** One foreground GATT wire: renew the heartbeat before starting a telemetry read. */
export class MotorCommunications {
  private busy=false;
  private generation=0;
  private current:MotorSession|null=null;
  private nextHeartbeat=0;
  private nextPoll=0;
  private readonly now:()=>number;
  private readonly hooks:Hooks;
  constructor(hooks:Hooks){this.hooks=hooks;this.now=hooks.now??(()=>performance.now());}
  async tick(){
    const s=this.hooks.session();
    if(!this.hooks.enabled()||!s?.connected)return;
    if(this.current!==s){this.current=s;this.generation++;this.busy=false;this.nextHeartbeat=this.nextPoll=0;}
    if(this.busy||s.busy||s.foregroundBusy)return;
    const generation=this.generation;
    this.busy=true;
    try{
      const polling=this.now()>=this.nextPoll;
      // A long read cannot be interrupted. Start it with a fresh lease while moving.
      if(this.hooks.heartbeatEnabled?.()!==false&&(this.now()>=this.nextHeartbeat||(polling&&s.status?.armed))){
        await s.heartbeat();if(generation!==this.generation)return;this.nextHeartbeat=this.now()+120;
      }
      if(polling&&this.hooks.enabled()&&s===this.hooks.session()&&s.connected&&!s.busy&&!s.foregroundBusy){
        await s.poll();if(generation===this.generation)this.nextPoll=this.now()+150;
      }
    }catch(error){if(generation===this.generation)this.hooks.error(error);}
    finally{if(generation===this.generation)this.busy=false;}
  }
}
