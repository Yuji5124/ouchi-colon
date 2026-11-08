import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,ACTION_IDS,DEFAULT_ACTION_SETTINGS,ACTION_SETTINGS_KEY,readActionSettings,planAction,faceAction,actionForCommand,validActionSettings,type ActionId} from '../src/motor/actions.ts';
import {ActionRunner} from '../src/motor/action-runner.ts';
import {defaultPatterns,ACTION_PATTERN_IDS,parsePatterns,validPattern} from '../src/motor/patterns.ts';
import {INITIAL_SETTINGS,OPS,makeFrame} from '../src/motor/protocol.ts';
import {MotorSession} from '../src/motor/session.ts';
import {MockTransport} from '../src/motor/transport.ts';
import {validMotorSignal} from '../src/motor/bridge.ts';

const settings={...DEFAULT_ACTION_SETTINGS};
const table=defaultPatterns(5);
for(const id of ACTION_PATTERN_IDS.slice(2))table[id]={speed:100,durationMs:id.endsWith('90')?1200:150};
const face={detected:true,x:0,size:0.2,at:100};
const plan=(id:ActionId)=>planAction(id,table,settings,face,500,100);

test('Actions: A01〜A17の一意な番号と、左右90°の共通定義',()=>{
  assert.equal(ACTIONS.length,17);assert.equal(new Set(ACTION_IDS).size,17);
  assert.deepEqual(plan('A11'),plan('A16'));assert.deepEqual(plan('A12'),plan('A15'));
  assert.deepEqual(plan('A11').moves[0],{left:-100,right:100,durationMs:1200,gapMs:100});
  assert.deepEqual(plan('A12').moves[0],{left:100,right:-100,durationMs:1200,gapMs:100});
  assert.deepEqual(plan('A17').moves,[]);
  for(const id of ACTION_IDS)for(const m of plan(id).moves){assert.equal(Math.abs(m.left),100);assert.equal(Math.abs(m.right),100);}
});
test('Actions: 到着2秒、うれしい2種、分からないは後進500ms・停止1000ms・前進500ms',()=>{
  assert.deepEqual(plan('A07'),{moves:[{left:100,right:100,durationMs:2000,gapMs:100}],speech:'来たよ〜',requiresFace:true});
  assert.deepEqual(plan('A08').moves.map(m=>[m.left,m.right,m.durationMs]),[[100,-100,1000],[-100,100,1000]]);
  assert.deepEqual(plan('A09').moves.map(m=>m.left),[-100,100]);
  assert.deepEqual(plan('A10').moves,[{left:-100,right:-100,durationMs:500,gapMs:1000},{left:100,right:100,durationMs:500,gapMs:100}]);
  assert.equal(validActionSettings({...settings,pauseMs:99}),false);
  assert.equal(validActionSettings({...settings,medium:0.9,large:0.8}),false);
  assert.throws(()=>planAction('A13',table,settings,face,501,100),/50〜500ms/);
});
test('Actions: 旧0.2秒設定は1秒へ移行し、顔・喜び設定は保持する',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const values=new Map([['colon-actions-v1',JSON.stringify({...DEFAULT_ACTION_SETTINGS,pauseMs:200,deadZone:0.2,happy:'A09'})]]);
  try{
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null}});
    assert.deepEqual(readActionSettings(),{...DEFAULT_ACTION_SETTINGS,pauseMs:1000,deadZone:0.2,happy:'A09'});
    values.set(ACTION_SETTINGS_KEY,JSON.stringify({...DEFAULT_ACTION_SETTINGS,pauseMs:1500}));
    assert.equal(readActionSettings().pauseMs,1500);
  }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
test('Actions: 顔の左右・ずれ・見かけの幅から6方向を選ぶ。古い入力は不可',()=>{
  for(const [x,id] of [[0.2,'A01'],[0.4,'A02'],[0.8,'A03'],[-0.2,'A04'],[-0.4,'A05'],[-0.8,'A06']] as const)assert.equal(faceAction({...face,x},settings,100),id);
  assert.equal(faceAction(face,settings,100),null);
  assert.equal(faceAction({...face,x:0.3,size:0.1},settings,100),'A02');
  assert.equal(faceAction({...face,x:0.4,size:0.5},settings,100),'A01');
  assert.throws(()=>faceAction(face,settings,1101));
  assert.throws(()=>planAction('A07',table,settings,{...face,detected:false},500,100));
});
test('Actions: 未校正90°や視線方向は、移動前に拒否する',()=>{
  const blank=defaultPatterns(5);
  for(const id of ['A11','A12','A15','A16'] as ActionId[])assert.throws(()=>planAction(id,blank,settings,face,500,100),/校正/);
  assert.throws(()=>planAction('A07',blank,settings,{...face,x:0.5},500,100),/校正/);
  const slots=ACTION_PATTERN_IDS.map(id=>[table[id].speed,table[id].durationMs]);
  assert.deepEqual(parsePatterns({version:5,slots},5),table);
  assert.equal(validPattern('right90',{speed:100,durationMs:2001},5),false);
  assert.throws(()=>parsePatterns({version:5,slots:slots.slice(0,8)},5));
});
test('Actions: 正確な呼びかけだけを処理し、会話中の言及は動作にしない',()=>{
  assert.equal(actionForCommand('こっち来て！'),'A07');assert.equal(actionForCommand('右を向いて。'),'A11');
  assert.equal(actionForCommand('左向いて'),'A12');assert.equal(actionForCommand('ストップ'),'A17');
  assert.deepEqual(['前','後ろ','左','右'].map(actionForCommand),['A13','A14','A15','A16']);
  assert.equal(actionForCommand('右向いてって言ったらどうなる？'),null);
  assert.equal(actionForCommand('こっちきての意味は？'),null);
  assert.equal(validMotorSignal({type:'colon-motor-gaze',id:'x',at:100,pose:face},100),true);
  assert.equal(validMotorSignal({type:'colon-motor-gaze',id:'x',at:100,pose:{...face,x:2}},100),false);
});

async function fixture(){
  const transport=new MockTransport(false,true),session=new MotorSession(transport);
  let now=0,speeches=0;
  const writes:Array<{left:number;right:number;duration:number}>=[],delays:number[]=[];
  transport.now=()=>now;
  session.settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
  const original=transport.write.bind(transport);
  transport.write=async frame=>{if(frame[1]===OPS.MOVE){const v=new DataView(frame.buffer,frame.byteOffset,frame.byteLength);writes.push({left:v.getInt8(10),right:v.getInt8(11),duration:v.getUint16(17,true)});}await original(frame);};
  await session.connect();now=100;
  Object.assign(transport.core.patterns,structuredClone(table));
  let onSleep:(ms:number)=>void|Promise<void>=()=>{},detected=true,heartbeats=true;
  const runner=new ActionRunner({session:()=>session,face:()=>({...face,detected,at:now}),speechReady:()=>'',speak:async()=>{assert.equal(session.status?.left,0);assert.equal(session.status?.right,0);speeches++;},changed:()=>{},now:()=>now,
    sleep:async(ms,signal)=>{await onSleep(ms);if(signal.aborted)throw new Error('cancelled');delays.push(ms);now+=ms;if(heartbeats)await session.heartbeat();await session.poll();},
  });
  return {runner,session,transport,writes,delays,speeches:()=>speeches,onSleep:(callback:(ms:number)=>void|Promise<void>)=>onSleep=callback,loseFace:()=>detected=false,noHeartbeat:()=>heartbeats=false};
}
test('Runner: 到着は連続2000msの1指令、実停止の応答後だけ発話',async()=>{
  const f=await fixture();try{await f.runner.run('A07',settings);assert.deepEqual(f.writes,[{left:100,right:100,duration:2000}]);assert.equal(f.speeches(),1);assert.equal(f.runner.running,false);}finally{f.session.disconnect();}
});
test('Runner: A10の後進500ms・1回の1000ms停止・前進500msを確認する',async()=>{
  const f=await fixture();try{await f.runner.run('A10',settings);assert.deepEqual(f.writes.map(m=>m.left),[-100,100]);assert.equal(f.delays.filter(ms=>ms===1000).length,1);assert.equal(f.session.status?.left,0);}finally{f.session.disconnect();}
});
test('Runner: 停止間隔中のA17で残りの前進指令を取り消す',async()=>{
  const f=await fixture();try{f.onSleep(ms=>{if(ms===1000){assert.equal(f.runner.restMs,1000);f.runner.stop();}});await assert.rejects(f.runner.run('A10',settings));assert.equal(f.writes.length,1);assert.equal(f.runner.running,false);assert.equal(f.speeches(),0);}finally{f.session.disconnect();}
});
test('Runner: 動作間に本体のSTOP応答を受けた場合も残りを再開しない',async()=>{
  const f=await fixture();try{
    f.onSleep(async ms=>{if(ms===1000){f.session.requestStop();await new Promise(resolve=>setTimeout(resolve,0));}});
    await assert.rejects(f.runner.run('A10',settings),/停止要求/);assert.equal(f.writes.length,1);
  }finally{f.session.disconnect();}
});
test('Runner: 切断後に再接続しても続きを再開しない',async()=>{
  const f=await fixture();try{f.onSleep(()=>f.session.disconnect());await assert.rejects(f.runner.run('A08',settings));await f.session.connect();assert.equal(f.writes.length,1);assert.equal(f.session.status?.left,0);}finally{f.session.disconnect();}
});
test('Runner: 心拍断・顔消失・再起動は後続動作と到着発話を中止する',async()=>{
  for(const reason of ['heartbeat','face','restart']){
    const f=await fixture();try{if(reason==='heartbeat')f.noHeartbeat();else f.onSleep(()=>{if(reason==='face')f.loseFace();else f.transport.reboot();});await assert.rejects(f.runner.run('A07',settings));assert.equal(f.writes.length,1);assert.equal(f.speeches(),0);}finally{f.session.disconnect();}
  }
});
test('Runner: 旧ファーム・重複実行・12000ms超・通常操作500ms超を拒否',async()=>{
  const f=await fixture();try{
    assert.throws(()=>makeFrame(f.session.status!,OPS.MOVE,1,{...f.session.settings,pulseMs:12001,actionStep:true},100,100));
    assert.throws(()=>makeFrame(f.session.status!,OPS.MOVE,1,{...f.session.settings,pulseMs:501},100,100));
    const operation=f.runner.run('A08',settings);await assert.rejects(f.runner.run('A09',settings),/動作中/);await operation;
    f.transport.core.state.firmware='colon-motor-1.6.1';f.transport.core.state.patternsVersion=4;await f.session.poll();
    await assert.rejects(f.runner.run('A08',settings),/1.8.0/);
  }finally{f.session.disconnect();}
});
