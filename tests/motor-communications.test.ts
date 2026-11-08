import test from 'node:test';
import assert from 'node:assert/strict';
import {MotorCommunications} from '../src/motor/communications.ts';
import {MotorSession} from '../src/motor/session.ts';
import {MockMotor} from '../src/motor/mock.ts';
import {INITIAL_SETTINGS,OPS} from '../src/motor/protocol.ts';
import type {Transport} from '../src/motor/transport.ts';

const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
/** Deterministic GATT latency; virtual motor time never waits on wall-clock Bluetooth. */
async function fixture(){
  let now=0,latency=false,enabled=true,heartbeats=true,started=0;
  const core=new MockMotor(false,true),pending:Array<{at:number;resolve:()=>void}>=[];
  const stops:Array<{reason:string;duration:number}>=[],events:number[]=[],errors:unknown[]=[];
  const delay=(ms:number)=>latency?new Promise<void>(resolve=>pending.push({at:now+ms,resolve})):Promise.resolve();
  const transport:Transport={kind:'mock',onDisconnect:()=>{},
    connect:async()=>{core.connect(now);},disconnect:()=>{core.disconnect(now);transport.onDisconnect();},
    read:async()=>{await delay(120);return core.status(now);},
    write:async frame=>{await delay(40);events.push(frame[1]);core.write(frame,now);if(frame[1]===OPS.MOVE&&core.state.armed)started=now;},
    readPatterns:async()=>structuredClone(core.patterns),
  };
  const s=new MotorSession(transport);s.settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
  await s.connect();
  const scheduler=new MotorCommunications({session:()=>s,enabled:()=>enabled,heartbeatEnabled:()=>heartbeats,error:e=>errors.push(e),now:()=>now});
  async function move(){await advance(300,'none');latency=false;now+=100;await s.driveTimed(-100,100,2000);latency=true;}
  async function advance(ms:number,mode:'old'|'new'|'none'){
    const end=now+ms,origin=now;
    for(;;){
      const moving=core.state.armed&&(core.state.left!==0||core.state.right!==0);
      core.tick(now);if(moving&&!core.state.armed)stops.push({reason:core.state.stopReason,duration:now-started});
      for(const task of pending.filter(p=>p.at<=now)){pending.splice(pending.indexOf(task),1);task.resolve();}
      await flush();
      const elapsed=now-origin;
      if(mode==='old'){if(elapsed%150===0)void s.poll();if(elapsed%120===0)void s.heartbeat().catch(e=>errors.push(e));}
      if(mode==='new'&&elapsed%40===0)void scheduler.tick();
      await flush();if(now===end)break;now=Math.min(end,now+10);
    }
  }
  async function close(){enabled=false;s.disconnect();await advance(500,'none');}
  return {s,core,move,advance,close,stops,events,errors,pauseHeartbeat:()=>{heartbeats=false;}};
}

test('Communications: 旧150ms読取り・120ms心拍の別タイマーでは120/40ms遅延で途中停止を再現',async()=>{
  const f=await fixture();try{
    await f.move();await f.advance(2300,'old');assert.equal(f.stops[0].reason,'heartbeat-timeout');assert.ok(f.stops[0].duration<2000);
    const captured=f.s.lastHeartbeatTimeoutAt;assert.ok(captured);f.s.requestStop();await f.advance(300,'none');
    assert.equal(f.s.lastHeartbeatTimeoutAt,captured,'後からSTOPを送っても心拍切れの記録を消さない');
  }finally{await f.close();}
});
test('Communications: 心拍優先なら同じ120/40ms遅延でもA01相当を3回とも2000msで完了',async()=>{
  const f=await fixture();try{
    for(let repeat=0;repeat<3;repeat++){await f.move();await f.advance(2300,'new');}
    assert.deepEqual(f.stops,Array.from({length:3},()=>({reason:'pulse-limit',duration:2000})));
    assert.equal(f.events.filter(op=>op===OPS.MOVE).length,3);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
test('Communications: 心拍停止時は優先処理でも350msの安全停止を維持し、自動再始動しない',async()=>{
  const f=await fixture();try{await f.move();f.pauseHeartbeat();await f.advance(2300,'new');assert.deepEqual(f.stops,[{reason:'heartbeat-timeout',duration:350}]);assert.equal(f.events.filter(op=>op===OPS.MOVE).length,1);assert.equal(f.core.state.left,0);}finally{await f.close();}
});
test('Communications: 古い接続の未完了読取りは、新しい接続の心拍を妨げない',async()=>{
  let releaseOld!:()=>void,releaseNext!:()=>void,oldWrites=0,nextWrites=0;
  const oldGate=new Promise<void>(resolve=>releaseOld=resolve),nextGate=new Promise<void>(resolve=>releaseNext=resolve);
  const old={connected:true,busy:false,foregroundBusy:false,status:{armed:true},heartbeat:async()=>{oldWrites++;},poll:async()=>oldGate} as unknown as MotorSession;
  const next={connected:true,busy:false,foregroundBusy:false,status:{armed:true},heartbeat:async()=>{nextWrites++;},poll:async()=>nextGate} as unknown as MotorSession;
  let current=old;
  const scheduler=new MotorCommunications({session:()=>current,enabled:()=>true,error:e=>{throw e;},now:()=>0});
  const pendingOld=scheduler.tick();await flush();current=next;
  const pendingNext=scheduler.tick();await flush();assert.equal(oldWrites,1);assert.equal(nextWrites,1);
  releaseOld();await pendingOld;await scheduler.tick();assert.equal(nextWrites,1,'古い処理の終了で新しい通信中フラグを解除しない');
  releaseNext();await pendingNext;
});
