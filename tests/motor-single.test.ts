import test from 'node:test';
import assert from 'node:assert/strict';
import {MockMotor} from '../src/motor/mock.ts';
import {INITIAL_SETTINGS,OPS,isBootFirmware,makeFrame,parseStatus,type Op} from '../src/motor/protocol.ts';
import {INITIAL_POWER,diagnosticRow,toCSV} from '../src/motor/diagnostics.ts';
import {singleTestBlock} from '../src/motor/single-test.ts';
import {validateManifest} from '../src/motor/usb-writer.ts';
import {bootPowerBlock} from '../src/motor/boot-test.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const settings={...INITIAL_SETTINGS,signalOnly:false,singleTest:true,pulseMs:100};

test('Boot trial: 設定値3VとVMの実測を区別し、電圧超過や書きかけの記録を拒否',()=>{
  const assumed={...INITIAL_POWER,settingV:3};
  assert.match(bootPowerBlock(assumed,false),/実測値/);
  const measured={...assumed,measuredV:3,measuredAt:'2026-11-07T00:00:00Z'};
  assert.equal(bootPowerBlock(measured,false),'');
  assert.notEqual(bootPowerBlock(measured,true),'');
  assert.notEqual(bootPowerBlock({...measured,measuredV:3.01},false),'');
  assert.notEqual(bootPowerBlock({...measured,measuredAt:null},false),'');
  assert.notEqual(bootPowerBlock({...measured,heat:'present'},false),'');
});

for(const [dir,version,kind,pulseMs,duty] of [
  ['boot','1.4.0','boot-trial',100,50],
  ['boot-dual','1.4.2','boot-dual',2000,100],
] as const){
  test(`Boot trial: ${version}の実配布ファームと制限を検証`,()=>{
    const url=new URL(`../public/firmware/${dir}/manifest.json`,import.meta.url);
    const data=JSON.parse(readFileSync(url,'utf8'));
    const manifest=validateManifest(data);
    assert.equal(manifest.version,version);
    assert.equal(manifest.poweredTests,kind);
    assert.equal(manifest.powerQualified,false);
    assert.equal(manifest.maxVmV,3);
    assert.equal(manifest.maxPulseMs,pulseMs);
    assert.equal(manifest.maxDuty,duty);
    assert.throws(()=>validateManifest({...data,maxVmV:3.3}));
    assert.throws(()=>validateManifest({...data,maxPulseMs:3000}));
    assert.throws(()=>validateManifest({...data,maxDuty:duty===50?100:50}));
    const firmware=`colon-motor-${version}`;
    const status={...new MockMotor().state,firmware,powerQualified:false};
    assert.ok(isBootFirmware(parseStatus(status)));
    assert.throws(()=>parseStatus({...status,powerQualified:true}));
    for(const part of manifest.parts){
      const bytes=readFileSync(new URL(part.path,url));
      assert.equal(bytes.length,part.size);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),part.sha256);
      assert.equal(createHash('md5').update(bytes).digest('hex'),part.md5);
      if(part.address===0x10000){
        assert.ok(bytes.includes(Buffer.from(firmware)));
        assert.ok(bytes.includes(Buffer.from('COLON_BOOT_TEST=1')));
        assert.ok(bytes.includes(Buffer.from('COLON_POWER_LOCK=0')));
        assert.equal(bytes.includes(Buffer.from('COLON_BOOT_DUAL_TEST=1')),kind==='boot-dual');
      }
    }
  });
}

test('Single: LCD版の実配布ファーム2種類の版・制限・ハッシュを検証',()=>{
  for(const [path,version,powered] of [['../public/firmware/manifest.json','1.1.1',false],['../public/firmware/experimental/manifest.json','1.2.1','experimental-single']] as const){
    const url=new URL(path,import.meta.url),m=validateManifest(JSON.parse(readFileSync(url,'utf8')));
    assert.equal(m.version,version);assert.equal(m.poweredTests,powered);assert.equal(m.lcdDisplay,true);
    for(const part of m.parts){const bytes=readFileSync(new URL(part.path,url));assert.equal(bytes.length,part.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),part.sha256);assert.equal(createHash('md5').update(bytes).digest('hex'),part.md5);if(part.address===0x10000){assert.ok(bytes.includes(Buffer.from(`colon-motor-${version}`)));assert.ok(bytes.includes(Buffer.from('COLON_POWER_LOCK=0')));assert.ok(!bytes.includes(Buffer.from('COLON_POWER_LOCK=1')));}}
  }
});
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
