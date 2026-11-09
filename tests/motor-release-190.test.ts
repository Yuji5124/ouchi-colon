import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMMON_TURN_MS,defaultPatterns,readLocalPatterns,patternStorageKey,ACTION_PATTERN_IDS,type PatternId} from '../src/motor/patterns.ts';
import {planAction,DEFAULT_ACTION_SETTINGS,type ActionId} from '../src/motor/actions.ts';
import {MockMotor} from '../src/motor/mock.ts';
import {MockTransport} from '../src/motor/transport.ts';
import {MotorSession} from '../src/motor/session.ts';
import {INITIAL_SETTINGS,OPS,makeFrame,parseStatus,heartbeatTimeout} from '../src/motor/protocol.ts';

const settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
test('1.9.0: 360 degrees in 6000ms gives shared 250/500/750/1500ms in every angle action',()=>{
 const table=defaultPatterns(7);
 for(const [angle,ms] of Object.entries(COMMON_TURN_MS))for(const side of ['left','right'])assert.equal(table[`${side}${angle}` as PatternId].durationMs,6000*Number(angle)/360);
 for(const [id,ms] of [['A01',250],['A02',500],['A03',750],['A04',250],['A05',500],['A06',750],['A11',1500],['A12',1500],['A15',1500],['A16',1500]] as Array<[ActionId,number]>)assert.equal(planAction(id,table,DEFAULT_ACTION_SETTINGS,null,500).moves[0].durationMs,ms);
 assert.equal(table.forward100.durationMs,1000);assert.equal(table.backward100.durationMs,1000);
});
test('1.9.0: separate PC and NVS namespaces preserve the old calibration for rollback',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map([[patternStorageKey(6),JSON.stringify(defaultPatterns(6))]]);
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null}});
  assert.equal(readLocalPatterns(7).right45.durationMs,750);
  assert.equal(readLocalPatterns(6).right45.durationMs,6000);
  assert.equal(values.size,1);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
 const main=readFileSync(new URL('../firmware/motor-test/src/main.cpp',import.meta.url),'utf8');
 assert.match(main,/key="patterns-v7";version=7;count=10/);
 assert.ok(!main.includes('remove("patterns-v6")'));
});
test('1.9.0: normal completion arriving before the first read is accepted without an extra STOP',async()=>{
 const t=new MockTransport(false,true,true),s=new MotorSession(t),writes:number[]=[];
 await s.connect();s.settings=settings;const write=t.write.bind(t);
 t.write=async frame=>{writes.push(frame[1]);await write(frame);if(frame[1]===OPS.MOVE)t.core.tick(t.now()+250);};
 try{await s.driveTimed(-100,100,250);assert.equal(s.status?.stopReason,'pulse-limit');assert.deepEqual(writes,[OPS.MOVE]);}
 finally{s.disconnect();}
});
test('1.9.0: a different receipt or operator stop is never mistaken for successful completion',async()=>{
 for(const change of ['receipt','stop']){
  const t=new MockTransport(false,true,true),s=new MotorSession(t);await s.connect();s.settings=settings;const write=t.write.bind(t);
  t.write=async frame=>{await write(frame);if(frame[1]===OPS.MOVE){t.core.tick(t.now()+250);if(change==='receipt')t.core.state.moveSeq=999;else t.core.state.stopReason='operator-stop';}};
  try{await assert.rejects(s.driveTimed(-100,100,250),/受付応答/);}finally{s.disconnect();}
 }
});
test('1.9.0: 1000ms heartbeat lease remains bounded; disconnect and STOP are immediate',()=>{
 for(const stop of ['timeout','disconnect','stop']){
  const c=new MockMotor(false,true,true,true);c.connect(0);
  c.write(makeFrame(c.state,OPS.MOVE,1,{...settings,actionStep:true,pulseMs:1500},-100,100),100);
  c.tick(1099);assert.equal(c.state.armed,true);
  if(stop==='timeout')c.tick(1100);else if(stop==='disconnect')c.disconnect(1100);else c.write(makeFrame(c.state,OPS.STOP,2,settings),1100);
  assert.equal(c.state.left,0);assert.equal(c.state.right,0);assert.equal(c.state.armed,false);
  c.connect(1200);assert.equal(c.state.armed,false);
 }
 assert.equal(heartbeatTimeout(new MockMotor(false,true).state),350);
});
test('1.9.0: compact wire status reconstructs physical outputs and validates the receipt',()=>{
 const c=new MockMotor(false,true,true,true),status={...c.state,left:100,right:-100,invert:3};
 assert.equal(parseStatus(status).physicalLeft,-100);assert.equal(parseStatus(status).physicalRight,100);
 assert.throws(()=>parseStatus({...status,moveSeq:undefined}));
 assert.throws(()=>parseStatus({...status,patternsVersion:6}));
 assert.throws(()=>parseStatus({...status,invert:4}));
});
test('1.9.0: pinned Notif manifest and calibration snapshot are independent of the future default',()=>{
 const read=(path:string)=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 const pinned=read('public/firmware/notif-1.9.0/manifest.json');assert.equal(pinned.version,'1.9.0');
 const snapshot=read('public/motor-release-1.9.0.json');assert.equal(snapshot.firmware,'colon-motor-1.9.0');
 assert.deepEqual(snapshot.turnMs,COMMON_TURN_MS);assert.equal(snapshot.patternsVersion,7);
 assert.equal(snapshot.patterns.length,ACTION_PATTERN_IDS.length);
});
