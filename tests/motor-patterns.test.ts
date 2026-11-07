import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultPatterns,adaptPatterns,PATTERN_IDS,PROGRAM_IDS,validPattern,patternOutput,parsePatterns} from '../src/motor/patterns.ts';
import {driveKey} from '../src/motor/keyboard.ts';
import {validColonEvent,publishMotorExpression} from '../src/motor/bridge.ts';
import {MockMotor} from '../src/motor/mock.ts';
import {OPS,INITIAL_SETTINGS,makeFrame} from '../src/motor/protocol.ts';
import {validateManifest,verifyChip,writeBundle,sha256,type FirmwareBundle} from '../src/motor/usb-writer.ts';
import {loadUsbLibrary} from '../src/motor/usb-library.ts';
function send(c:MockMotor,op:typeof OPS[keyof typeof OPS],now:number,left=0,right=0,duration?:number){const f=makeFrame(c.state,op,c.state.seq+1,INITIAL_SETTINGS,left,right);if(duration!==undefined)new DataView(f.buffer).setUint16(17,duration,true);c.write(f,now);}
test('USB: 実際の同梱ブラウザ用ライブラリを読み込める。準備時に機器へアクセスしない',async()=>{const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');try{Object.defineProperty(globalThis,'navigator',{configurable:true,get(){throw new Error('USB access is forbidden during preparation');}});const library=await loadUsbLibrary();assert.equal(typeof library.ESPLoader,'function');assert.equal(typeof library.Transport,'function');assert.equal(typeof library.ESPLoader.prototype.writeFlash,'function');}finally{if(original)Object.defineProperty(globalThis,'navigator',original);else Reflect.deleteProperty(globalThis,'navigator');}});
test('Patterns: 前後25/50/75と左右15/30/45の12種類。旋回は未校正で禁止',()=>{const t=defaultPatterns();assert.equal(PATTERN_IDS.length,12);for(const id of PATTERN_IDS.slice(6))assert.equal(t[id].durationMs,0);assert.deepEqual(PATTERN_IDS.slice(0,3).map(id=>t[id].speed),[25,50,75]);assert.deepEqual(patternOutput('right30',25),[25,-25]);assert.deepEqual(patternOutput('left45',50),[-50,50]);});
test('Patterns: PWMと時間を検証し、指定出力や500ms制限を勝手に変えない',()=>{assert.equal(validPattern('forward25',{speed:50,durationMs:200}),false);assert.equal(validPattern('left15',{speed:25,durationMs:501}),false);assert.equal(validPattern('left15',{speed:25,durationMs:0}),true);assert.equal(validPattern('left15',{speed:25,durationMs:250}),true);assert.throws(()=>parsePatterns({version:1,slots:[]}));});
test('Program: No. 1〜8の順序、固定の前後動作、時間未校正の左右旋回',()=>{
  assert.deepEqual(PROGRAM_IDS,['forward100','backward100','right15','right30','right45','left15','left30','left45']);
  const slots=[[100,1000],[100,1000],[25,0],[50,120],[75,500],[25,0],[50,150],[75,490]];
  const table=parsePatterns({version:2,slots},2);
  assert.deepEqual(table.forward100,{speed:100,durationMs:1000});
  assert.deepEqual(table.backward100,{speed:100,durationMs:1000});
  assert.deepEqual(table.right30,{speed:50,durationMs:120});
  assert.throws(()=>parsePatterns({version:2,slots},1));
  assert.throws(()=>parsePatterns({version:2,slots:[[100,999],...slots.slice(1)]},2));
  assert.throws(()=>parsePatterns({version:2,slots:[...slots.slice(0,7),[75,501]]},2));
});
test('Program: 全方向100%と時間で制御し、低出力の校正時間を引き継がない',()=>{
  const old=defaultPatterns();
  old.right15={speed:75,durationMs:180};
  old.left45={speed:100,durationMs:300};
  const table=adaptPatterns(old,3);
  assert.deepEqual(table.right15,{speed:100,durationMs:0});
  assert.deepEqual(table.left45,{speed:100,durationMs:300});
  const slots=PROGRAM_IDS.map(id=>[table[id].speed,table[id].durationMs]);
  assert.deepEqual(parsePatterns({version:3,slots},3),table);
  assert.throws(()=>parsePatterns({version:3,slots:[[100,1000],[100,1000],[75,100],...slots.slice(3)]},3));
  assert.throws(()=>parsePatterns({version:3,slots},2));
  const c=new MockMotor(false,true);c.connect(0);
  send(c,OPS.SAVE_PATTERN,100,2,100,150);
  send(c,OPS.ARM,101);send(c,OPS.PATTERN,102,2);
  assert.deepEqual([c.state.left,c.state.right],[100,-100]);
  assert.equal(c.status(252).stopReason,'pulse-limit');
});
test('Program: モックでも前後は全出力で1000ms、または通信断で停止',()=>{
  for(const [slot,duty] of [[0,100],[1,-100]]){
    const c=new MockMotor(false,true);c.connect(0);
    send(c,OPS.ARM,100);send(c,OPS.PATTERN,101,slot);
    assert.deepEqual([c.state.left,c.state.right],[duty,duty]);
    for(const now of [300,550,800,1050])send(c,OPS.HEARTBEAT,now);
    assert.equal(c.status(1100).pulseMs,1000);
    assert.deepEqual([c.state.left,c.state.right],[duty,duty]);
    assert.equal(c.status(1101).stopReason,'pulse-limit');
    assert.equal(c.state.left,0);assert.equal(c.state.right,0);
    send(c,OPS.ARM,1201);send(c,OPS.PATTERN,1202,slot);
    c.disconnect(1203);assert.equal(c.state.armed,false);assert.equal(c.state.left,0);
  }
});
test('Program: WASDは物理キーで選択し、キー離しで大文字小文字が変わっても同じ識別子',()=>{
  for(const [code,key,motion] of [['KeyW','w','forward'],['KeyS','s','backward'],['KeyA','a','left'],['KeyD','d','right']]){
    assert.equal(driveKey(code,key)?.motion,motion);
    assert.equal(driveKey(code,key.toUpperCase())?.token,driveKey(code,key)?.token);
    assert.equal(driveKey('',key.toUpperCase())?.motion,motion);
  }
  assert.equal(driveKey('ArrowUp','ArrowUp')?.motion,'forward');
  assert.equal(driveKey('KeyF','w'),null);
});
test('Patterns: 保存・読戻し・再起動保持をモックで確認',()=>{const c=new MockMotor();c.connect(0);send(c,OPS.SAVE_PATTERN,100,7,50,150);assert.deepEqual(c.patterns.right30,{speed:50,durationMs:150});c.reboot(200);assert.deepEqual(c.patterns.right30,{speed:50,durationMs:150});send(c,OPS.ARM,300);send(c,OPS.PATTERN,301,7);c.tick(351);assert.equal(c.state.left,50);assert.equal(c.state.right,-50);c.tick(451);assert.equal(c.state.armed,false);assert.equal(c.state.stopReason,'pulse-limit');});
test('Patterns: 未校正の旋回と、許可中の設定書換えは停止・拒否',()=>{const c=new MockMotor();c.connect(0);send(c,OPS.ARM,100);send(c,OPS.PATTERN,101,6);assert.equal(c.state.stopReason,'pattern-uncalibrated');send(c,OPS.ARM,201);send(c,OPS.SAVE_PATTERN,202,6,25,150);assert.equal(c.state.armed,false);assert.equal(c.patterns.right15.durationMs,0);});
test('Patterns: 連動イベントは既知の表情・1秒以内のみ。会話本文は使わない',()=>{assert.ok(validColonEvent({type:'colon-expression',expression:'HAPPY',id:'x',at:100},100));assert.equal(validColonEvent({type:'colon-expression',expression:'HAPPY',id:'x',at:100},1101),false);assert.equal(validColonEvent({type:'colon-expression',expression:'GO_ANYWHERE',id:'x',at:100},100),false);assert.equal(validColonEvent({type:'colon-expression',expression:'HAPPY',id:'x',at:200},100),false);const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');assert.match(main,/publishMotorExpression\(expression\)/);});
const manifest={schema:'colon-firmware/1',version:'1.1.0',chip:'ESP32-S3',flashBytes:8388608,poweredTests:false,parts:[0,0x8000,0xe000,0x10000].map((address,i)=>({path:`colon-motor-1.1.0/file${i}.bin`,address,size:100,sha256:'0'.repeat(64),md5:'0'.repeat(32)}))};
test('Patterns: ブラウザが連動用チャンネルを拒否しても既存表情を壊さない',()=>{const original=globalThis.BroadcastChannel;try{globalThis.BroadcastChannel=class {constructor(){throw new Error('denied');}} as unknown as typeof BroadcastChannel;assert.doesNotThrow(()=>publishMotorExpression('HAPPY'));}finally{globalThis.BroadcastChannel=original;}});
test('USB: フラッシュ範囲、対象チップ、通電ロックを確認',()=>{assert.doesNotThrow(()=>validateManifest(manifest));assert.throws(()=>validateManifest({...manifest,poweredTests:true}));assert.throws(()=>validateManifest({...manifest,chip:'ESP32'}));const changed=structuredClone(manifest);changed.parts[1].size=8192;assert.throws(()=>validateManifest(changed));});
test('USB: ESP32-S3以外や小容量の実機を拒否。選択後の自動書込みなし',async()=>{await assert.rejects(verifyChip({main:async()=>'ESP32',readFlashId:async()=>0x1740ef}));await assert.rejects(verifyChip({main:async()=>'ESP32-S3',readFlashId:async()=>0x1640ef}));assert.equal(await verifyChip({main:async()=>'ESP32-S3',readFlashId:async()=>0x1740ef}),'ESP32-S3');});
test('USB: eraseAll=false、4分割の書込み、MD5照合、再起動は別操作',async()=>{let options:Record<string,unknown>|null=null,resets=0;const b={manifest:validateManifest(manifest),parts:manifest.parts.map(p=>({...p,data:new Uint8Array(100)}))} as FirmwareBundle;let progress=0;await writeBundle({writeFlash:async o=>{options=o as Record<string,unknown>;},flashMd5sum:async()=>'0'.repeat(32),after:async()=>{resets++;}},b,n=>progress=n);assert.equal(options!['eraseAll'],false);assert.equal((options!['fileArray'] as unknown[]).length,4);assert.equal(progress,100);assert.equal(resets,0);await assert.rejects(writeBundle({writeFlash:async()=>{},flashMd5sum:async()=>'bad',after:async()=>{}},b,()=>{}),/MD5/);});
test('USB: 同梱バイナリのSHA-256を確認するヘルパー',async()=>{assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');});
test('USB: 走行プログラム実配布ファームの版・時間・ハッシュ',async()=>{
  const url=new URL('../public/firmware/program/manifest.json',import.meta.url);
  const data=JSON.parse(readFileSync(url,'utf8')),program=validateManifest(data);
  assert.equal(program.version,'1.6.0');assert.equal(program.poweredTests,'drive-program');
  assert.equal(program.maxPulseMs,1000);assert.equal(program.maxDuty,100);
  assert.throws(()=>validateManifest({...data,maxPulseMs:2000}));
  assert.throws(()=>validateManifest({...data,powerQualified:true}));
  for(const part of program.parts){
    const bytes=readFileSync(new URL(part.path,url));
    assert.equal(bytes.length,part.size);assert.equal(await sha256(bytes),part.sha256);
    if(part.address===0x10000){
      assert.ok(bytes.includes(Buffer.from('COLON_PROGRAM=1')));
      assert.ok(bytes.includes(Buffer.from('COLON_DIRECT=1')));
      assert.ok(bytes.includes(Buffer.from('COLON_POWER_LOCK=0')));
      assert.ok(!bytes.includes(Buffer.from('COLON_BOOT_TEST=1')));
    }
  }
});
