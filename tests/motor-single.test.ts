import test from 'node:test';
import assert from 'node:assert/strict';
import {MockMotor} from '../src/motor/mock.ts';
import {INITIAL_SETTINGS,OPS,makeFrame,parseStatus,type Op} from '../src/motor/protocol.ts';
import {INITIAL_POWER,diagnosticRow,toCSV} from '../src/motor/diagnostics.ts';
import {singleTestBlock} from '../src/motor/single-test.ts';
import {validateManifest} from '../src/motor/usb-writer.ts';
const settings={...INITIAL_SETTINGS,signalOnly:false,singleTest:true,pulseMs:100};
function core(){const c=new MockMotor(true);c.connect(0);return c;}
function send(c:MockMotor,op:Op,now:number,l=0,r=0){c.write(makeFrame(c.state,op,c.state.seq+1,settings,l,r),now);}
function arm(c:MockMotor,now=100){send(c,OPS.CONFIG,now);send(c,OPS.ARM,now);assert.equal(c.state.armed,true);}
test('Single: 実測なしの明示モードを使い、電源適合済みへ昇格させない',()=>{
  const c=core();arm(c);assert.equal(c.state.powerQualified,false);assert.equal(c.state.signalOnly,false);
  assert.equal(singleTestBlock(c.state,settings,INITIAL_POWER,5),'');
  assert.notEqual(singleTestBlock(c.state,settings,{...INITIAL_POWER,measuredV:5},5),'');
  assert.notEqual(singleTestBlock(c.state,settings,INITIAL_POWER,6),'');
  assert.throws(()=>parseStatus({...c.state,powerQualified:true}));
});
test('Single: 左右それぞれ1個だけを動かし、心拍が続いても100msで停止・許可解除',()=>{
  const c=core();arm(c);send(c,OPS.MOVE,101,75,0);c.tick(176);assert.equal(c.state.left,75);assert.equal(c.state.right,0);
  send(c,OPS.HEARTBEAT,180);c.tick(201);assert.equal(c.state.armed,false);assert.equal(c.state.left,0);assert.equal(c.state.stopReason,'pulse-limit');
  arm(c,301);send(c,OPS.MOVE,302,0,-50);c.tick(352);assert.equal(c.state.right,-50);assert.equal(c.state.left,0);c.tick(402);assert.equal(c.state.armed,false);
});
test('Single: 両輪駆動、76%以上、パターン実行、長いパルスを拒否',()=>{
  for(const [op,l,r] of [[OPS.MOVE,25,25],[OPS.MOVE,76,0],[OPS.PATTERN,0,0]] as const){const c=core();arm(c);send(c,op,101,l,r);assert.equal(c.state.armed,false);assert.equal(c.state.left,0);}
  const c=core();assert.throws(()=>makeFrame(c.state,OPS.CONFIG,1,{...settings,pulseMs:101}));
  const raw=makeFrame(c.state,OPS.CONFIG,1,settings);new DataView(raw.buffer).setUint16(17,500,true);c.write(raw,100);assert.equal(c.state.stopReason,'single-config-limit');
});
test('Single: 信号試験や通常通電のARMで単独版の制限を回避できない',()=>{
  for(const signalOnly of [true,false]){const c=core();c.write(makeFrame(c.state,OPS.ARM,1,{...INITIAL_SETTINGS,signalOnly}),100);assert.equal(c.state.armed,false);assert.equal(c.state.stopReason,'single-mode-required');}
  const c=new MockMotor();c.connect(0);send(c,OPS.CONFIG,100);send(c,OPS.ARM,100);assert.equal(c.state.armed,false);assert.equal(c.state.stopReason,'single-mode-unavailable');
});
test('Single: 切断・再接続後に単体駆動を再開せず、旧フレームを拒否',()=>{
  const c=core();arm(c);const old=makeFrame(c.state,OPS.MOVE,c.state.seq+1,settings,25,0);c.disconnect(101);c.connect(102);c.write(old,202);assert.equal(c.state.armed,false);assert.equal(c.state.left,0);
});
test('Single: ログは想定1.5V・未測定・未適合を区別し、実測値を捏造しない',()=>{
  const c=core();const row=diagnosticRow({phase:5,source:'firmware',event:'single-test',status:c.state,pwm:settings,power:INITIAL_POWER});
  assert.equal(row.assumedMotorV,1.5);assert.equal(row.power.measuredV,null);assert.equal(row.provenance.assumedMotorV,'user-assumption');assert.equal(row.provenance.measuredV,'unmeasured');assert.ok(toCSV([row]).includes('unverified'));
});
test('Single: 配布一覧に限定条件を明示し、条件の弱いパッケージを拒否',()=>{
  const manifest={schema:'colon-firmware/1',version:'1.2.0',chip:'ESP32-S3',flashBytes:8388608,poweredTests:'experimental-single',powerQualified:false,assumedV:1.5,maxPulseMs:100,maxDuty:75,parts:[0,0x8000,0xe000,0x10000].map((address,i)=>({path:`colon-motor-1.2.0/file${i}.bin`,address,size:100,sha256:'0'.repeat(64),md5:'0'.repeat(32)}))};
  assert.doesNotThrow(()=>validateManifest(manifest));assert.throws(()=>validateManifest({...manifest,powerQualified:true}));assert.throws(()=>validateManifest({...manifest,maxPulseMs:500}));assert.throws(()=>validateManifest({...manifest,assumedV:5}));assert.throws(()=>validateManifest({...manifest,poweredTests:false}));
});
