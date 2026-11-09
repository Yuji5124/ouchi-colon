import test from 'node:test';
import assert from 'node:assert/strict';
import {LEGACY_TURN_MS,ACTION_PATTERN_IDS,defaultPatterns,parsePatterns,setSharedTurn,sharedTurnsMatch,readLocalPatterns,type PatternId} from '../src/motor/patterns.ts';
import {MockMotor} from '../src/motor/mock.ts';
import {INITIAL_SETTINGS,OPS,makeFrame} from '../src/motor/protocol.ts';
import {planAction,DEFAULT_ACTION_SETTINGS,type ActionId} from '../src/motor/actions.ts';
import {MotorSession} from '../src/motor/session.ts';
import {MockTransport} from '../src/motor/transport.ts';

const settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
test('Common turns: 左右15/30/45/90°は2000/4000/6000/12000ms、前後進は1秒',()=>{
  const table=defaultPatterns(6);
  for(const [angle,duration] of Object.entries(LEGACY_TURN_MS))for(const side of ['right','left'])assert.deepEqual(table[`${side}${angle}` as PatternId],{speed:100,durationMs:duration});
  assert.equal(table.forward100.durationMs,1000);assert.equal(table.backward100.durationMs,1000);
  const slots=ACTION_PATTERN_IDS.map(id=>[table[id].speed,table[id].durationMs]);
  assert.deepEqual(parsePatterns({version:6,slots},6),table);
  const mismatch=structuredClone(slots);mismatch[5][1]=2100;assert.throws(()=>parsePatterns({version:6,slots:mismatch},6),/一致/);
  assert.throws(()=>parsePatterns({version:5,slots},5));
});
test('Common turns: 片側の編集・保存は左右両方へ反映し、再起動後も保持',()=>{
  const table=defaultPatterns(6);setSharedTurn(table,'left30',{speed:100,durationMs:4500});
  assert.equal(table.right30.durationMs,4500);assert.equal(table.left30.durationMs,4500);assert.equal(sharedTurnsMatch(table),true);
  const c=new MockMotor(false,true);c.connect(0);
  const frame=makeFrame(c.state,OPS.SAVE_PATTERN,1,settings,3,100);new DataView(frame.buffer).setUint16(17,4500,true);c.write(frame,100);
  assert.equal(c.patterns.right30.durationMs,4500);assert.equal(c.patterns.left30.durationMs,4500);
  c.reboot(200);assert.equal(c.patterns.left30.durationMs,4500);assert.equal(c.patterns.right45.durationMs,6000);
});
test('Common turns: 番号・顔方向・こっちきて・90°エイリアスが同じ時間を参照',()=>{
  const table=defaultPatterns(6),face={detected:true,x:0.8,size:0.2,at:100};
  for(const [id,duration] of [['A01',2000],['A02',4000],['A03',6000],['A04',2000],['A05',4000],['A06',6000],['A11',12000],['A12',12000],['A15',12000],['A16',12000]] as Array<[ActionId,number]>)assert.equal(planAction(id,table,DEFAULT_ACTION_SETTINGS,face,500,100).moves[0].durationMs,duration);
  assert.deepEqual(planAction('A07',table,DEFAULT_ACTION_SETTINGS,face,500,100).moves.map(m=>m.durationMs),[6000,2000]);
  assert.deepEqual(planAction('A08',table,DEFAULT_ACTION_SETTINGS,face,500,100).moves.map(m=>m.durationMs),[1000,1000]);
  setSharedTurn(table,'left45',{speed:100,durationMs:6500});
  assert.equal(planAction('A03',table,DEFAULT_ACTION_SETTINGS,face,500,100).moves[0].durationMs,6500);
  assert.equal(planAction('A06',table,DEFAULT_ACTION_SETTINGS,face,500,100).moves[0].durationMs,6500);
});
test('Common turns: 12秒でも心拍断350msで停止し、心拍継続時も12秒上限で停止',()=>{
  for(const heartbeat of [false,true]){
    const c=new MockMotor(false,true);c.connect(0);c.write(makeFrame(c.state,OPS.MOVE,1,{...settings,pulseMs:12000,actionStep:true},100,-100),100);
    if(heartbeat){for(let now=300;now<12100;now+=200){c.write(makeFrame(c.state,OPS.HEARTBEAT,c.state.seq+1,settings),now);c.tick(now);assert.equal(c.state.armed,true);}c.tick(12100);assert.equal(c.state.stopReason,'pulse-limit');}
    else{c.tick(450);assert.equal(c.state.stopReason,'heartbeat-timeout');}
    assert.equal(c.state.armed,false);assert.equal(c.state.left,0);assert.equal(c.state.right,0);
  }
  const old=new MockMotor(false,true,false);
  assert.throws(()=>makeFrame(old.state,OPS.MOVE,1,{...settings,pulseMs:12000,actionStep:true},100,-100),/1.9.0/);
});
test('Common turns: 旧PC設定を混在させず、新しい共通値を初期表示する',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>key==='colon-motor-patterns-v5'?JSON.stringify(defaultPatterns(5)):null}});assert.deepEqual(readLocalPatterns(6),defaultPatterns(6));}
  finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
test('Common turns: 左右が異なる表は1フレームも書き込まずに拒否',async()=>{
  const t=new MockTransport(false,true),s=new MotorSession(t);await s.connect();const table=defaultPatterns(6);table.left15.durationMs=2100;
  let writes=0;t.write=async()=>{writes++;};
  try{await assert.rejects(s.savePatternTable(table),/一致/);assert.equal(writes,0);}finally{s.disconnect();}
});
