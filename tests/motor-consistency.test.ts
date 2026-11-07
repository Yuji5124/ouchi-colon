import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MockMotor} from '../src/motor/mock.ts';
import {INITIAL_SETTINGS,MOTOR_SERVICE,MOTOR_COMMAND,MOTOR_STATUS,MOTOR_PATTERNS,OPS,makeFrame,isActionFirmware} from '../src/motor/protocol.ts';
import {ACTION_PATTERN_IDS,defaultPatterns,readLocalPatterns,patternStorageKey} from '../src/motor/patterns.ts';
import {INITIAL_POWER,diagnosticRow,toCSV} from '../src/motor/diagnostics.ts';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Consistency: 配布版・Web識別・GPIO・BLE UUID・パターン数が本体ソースと一致',()=>{
  const main=read('firmware/motor-test/src/main.cpp');
  const version=main.match(/#elif MOTOR_PROGRAM\s+#define COLON_FIRMWARE_VERSION "([^"]+)"/)![1];
  const manifest=JSON.parse(read('public/firmware/program/manifest.json'));
  assert.equal(manifest.version,version);assert.equal(isActionFirmware({firmware:'colon-motor-'+version} as never),true);
  assert.ok(read('src/motor/usb-screen.ts').includes('走行プログラム'+version));
  assert.ok(read('src/motor/usb-screen.ts').includes("path:'program/'"));
  for(const part of manifest.parts){
    const bytes=readFileSync(new URL('../public/firmware/program/'+part.path,import.meta.url));
    assert.equal(bytes.length,part.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),part.sha256);
    assert.equal(createHash('md5').update(bytes).digest('hex'),part.md5);
    if(part.address===0x10000)assert.ok(bytes.includes(Buffer.from('colon-motor-'+version)));
  }
  for(const uuid of [MOTOR_SERVICE,MOTOR_COMMAND,MOTOR_STATUS,MOTOR_PATTERNS])assert.ok(main.includes('"'+uuid+'"'));
  assert.match(main,/AIN1=5, AIN2=6, BIN1=7, BIN2=8/);
  const count=Number(read('firmware/motor-test/include/Patterns.h').match(/PROGRAM_COUNT=(\d+)/)![1]);
  assert.equal(ACTION_PATTERN_IDS.length,count);assert.equal(count,10);
  assert.equal(manifest.maxVmV,3);assert.equal(manifest.maxDuty,100);assert.equal(manifest.powerQualified,false);
});
test('Consistency: MOVEのmode4は500ms・mode5は2000ms、心拍350ms・停止間隔100ms',()=>{
  const core=read('firmware/motor-test/include/MotorCore.h');
  for(const [key,expected] of [['MAX_PULSE_MS',500],['MAX_ACTION_MS',2000],['HEARTBEAT_TIMEOUT_MS',350],['REVERSAL_DWELL_MS',100]] as const){
    assert.equal(Number(core.match(new RegExp(key+' = (\\d+)'))![1]),expected);
  }
  const c=new MockMotor(false,true),settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true};
  const regular=makeFrame(c.state,OPS.MOVE,1,{...settings,pulseMs:500},100,100);
  const action=makeFrame(c.state,OPS.MOVE,1,{...settings,pulseMs:2000,actionStep:true},100,100);
  assert.equal(regular[16],4);assert.equal(action[16],5);assert.equal(action[15],0);
  assert.equal(new DataView(action.buffer).getUint16(17,true),2000);
  assert.throws(()=>makeFrame(c.state,OPS.MOVE,1,{...settings,pulseMs:501},100,100));
  assert.throws(()=>makeFrame(c.state,OPS.MOVE,1,{...settings,pulseMs:2001,actionStep:true},100,100));
});
test('Consistency: ログは前後進設定500msと実行指令2000ms、電池想定3Vと実測なしを区別',()=>{
  const c=new MockMotor(false,true),pwm={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
  c.connect(0);c.write(makeFrame(c.state,OPS.MOVE,1,{...pwm,actionStep:true,pulseMs:2000},100,100),100);
  const row=diagnosticRow({phase:6,source:'mock',event:'MOVE',status:c.status(101),pwm,power:{...INITIAL_POWER,settingV:3}});
  assert.equal(row.pwm.pulseMs,500);assert.equal(row.activePulseMs,2000);
  assert.equal(row.assumedMotorV,3);assert.equal(row.provenance.assumedMotorV,'user-assumption');
  assert.equal(row.power.measuredV,null);assert.equal(row.provenance.measuredV,'unmeasured');
  assert.ok(toCSV([row]).includes('実行パルスms（本体指令）'));
  c.stop('operator-stop',102);
  const stopped=diagnosticRow({phase:6,source:'mock',event:'STOP',status:c.status(103),pwm,power:{...INITIAL_POWER,settingV:3}});
  assert.equal(stopped.activePulseMs,null,'停止後の保持設定を実行中として記録しない');
  assert.equal(row.activePulseMs,2000,'過去ログの値は停止後も変わらない');
});
test('Consistency: 旧v4校正を左右のまま移行し、90°は未校正。新規値は100%固定',()=>{
  const saved=defaultPatterns(4);saved.right15.durationMs=120;saved.left15.durationMs=240;
  const values=new Map([[patternStorageKey(4),JSON.stringify(saved)]]);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null}});
    const latest=readLocalPatterns(5);
    assert.equal(latest.right15.durationMs,120);assert.equal(latest.left15.durationMs,240);
    assert.equal(latest.right90.durationMs,0);assert.equal(latest.left90.durationMs,0);
    assert.deepEqual(ACTION_PATTERN_IDS.map(id=>latest[id].speed),Array(10).fill(100));
    assert.equal(latest.forward100.durationMs,1000);assert.equal(latest.backward100.durationMs,1000);
  }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
test('Consistency: モックも本体と同じ再起動稼働時間・ARM重複拒否・ゼロ駆動拒否',()=>{
  const c=new MockMotor(false,true);assert.equal(c.state.signalOnly,false);c.connect(0);c.tick(1000);c.reboot(1200);
  assert.equal(c.status(1250).uptimeMs,50);
  const arm=()=>makeFrame(c.state,OPS.ARM,c.state.seq+1,INITIAL_SETTINGS);
  c.write(arm(),1300);assert.equal(c.state.armed,true);c.write(arm(),1301);
  assert.equal(c.state.stopReason,'already-armed');assert.equal(c.state.armed,false);
  const settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,pulseMs:500};
  const frame=makeFrame(c.state,OPS.MOVE,c.state.seq+1,settings,100,100);frame[10]=frame[11]=0;
  c.write(frame,1401);assert.equal(c.state.stopReason,'rc-duty-limit');assert.equal(c.state.armed,false);
});
test('Consistency: 本体が受け付ける旧RC ARMもモックで同じように受け付ける',()=>{
  const c=new MockMotor(false,true);c.connect(0);
  const settings={...INITIAL_SETTINGS,signalOnly:false,rcTest:true};
  c.write(makeFrame(c.state,OPS.ARM,1,settings),100);
  assert.equal(c.state.armed,true);assert.equal(c.state.signalOnly,false);assert.equal(c.state.powerQualified,false);
  c.write(makeFrame(c.state,OPS.MOVE,2,settings,100,100),101);
  assert.equal(c.state.left,100);assert.equal(c.state.right,100);
  c.status(451);assert.equal(c.state.stopReason,'heartbeat-timeout');
});
