import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ColonBleController,bleBrowserSupport,bleDirections} from '../src/robot/ble-controller.ts';
import {MockTransport} from '../src/robot/ble-core/transport.ts';
import {OPS} from '../src/robot/ble-core/protocol.ts';
import {DEFAULT_MOTOR_SETTINGS} from '../src/motor/protocol.ts';
import {driveButtonDisabled} from '../src/robot/rc-controls.ts';
const settings={...DEFAULT_MOTOR_SETTINGS,leftPercent:100,rightPercent:100};
const checks={wiring:true,physicalSwitch:true,raised:true,vmOff:false,voltageMeasured:false,currentReviewed:true,legacyBlePowerReviewed:true};
test('held RC button survives foreground reservation and pre-MOVE stopped telemetry',async()=>{
  const t=new MockTransport(false,true);const frames:Uint8Array[]=[];const write=t.write.bind(t);let watch=false;
  t.write=async frame=>{frames.push(frame.slice());await write(frame);};
  const beforeWrite:Array<{pressed:number;disabled:boolean}>=[];
  const c=new ColonBleController(()=>{if(watch&&!frames.some(f=>f[1]===OPS.MOVE))beforeWrite.push({pressed:c.pressed,disabled:driveButtonDisabled({rc:true,connected:c.connected,estop:!!c.status?.estop,permitted:c.permitted,busy:c.busy,held:c.pressed>0})});},t,false);
  try{
    await c.connect();await c.configure({...settings,pulseMs:500});await c.arm(0,checks);watch=true;
    const motion=c.drive(1,1);await Promise.resolve();assert.equal(c.pressed,1,'stopped telemetry during direction dwell must not release touch capture');
    await motion;assert.ok(beforeWrite.length>=2);assert.ok(beforeWrite.every(s=>s.pressed===1&&!s.disabled));
    assert.equal(frames.filter(f=>f[1]===OPS.MOVE).length,1);assert.equal(c.permitted,false);
    assert.equal(driveButtonDisabled({rc:true,connected:true,estop:false,permitted:false,busy:c.busy,held:false}),true,'other buttons remain locked');
    await c.stop();assert.equal(t.core.state.left,0);assert.equal(c.pressed,0);
  }finally{watch=false;c.disconnect();}
});
async function fixture(){
  let now=0;const frames:Uint8Array[]=[];const t=new MockTransport(false,true);t.now=()=>now;
  const write=t.write.bind(t);t.write=async frame=>{frames.push(frame.slice());await write(frame);};
  const c=new ColonBleController(()=>{},t,false);await c.connect();
  return {c,t,frames,time:(value:number)=>{now=value;}};
}
test('BLE feature detection distinguishes Safari, supported browser and unavailable recognition',()=>{
  assert.equal(bleBrowserSupport({secure:true,bluetooth:false,recognition:true}).available,false);
  assert.match(bleBrowserSupport({secure:true,bluetooth:false,recognition:true}).message,/Bluefy/);
  assert.equal(bleBrowserSupport({secure:false,bluetooth:true,recognition:true}).available,false);
  assert.match(bleBrowserSupport({secure:true,bluetooth:true,recognition:false}).message,/文字入力/);
  assert.match(bleBrowserSupport({secure:true,bluetooth:true,recognition:true}).message,/実機/);
});
test('existing BLE connection never moves or asserts power qualification; permission is local',async()=>{
  const {c,t,frames}=await fixture();try{
    assert.ok(c.connected);assert.equal(c.permitted,false);assert.equal(c.status?.armed,false);
    await assert.rejects(()=>c.configure({...settings,leftPercent:15}),/100%/);
    await c.configure(settings);
    await assert.rejects(()=>c.arm(0,{...checks,legacyBlePowerReviewed:false}),/100%/);
    await c.arm(0,checks);assert.equal(c.permitted,true);assert.equal(c.status?.armed,false);assert.equal(c.status?.powerQualified,false);
    assert.equal(frames.length,0);assert.equal(t.core.state.left,0);
  }finally{c.disconnect();}
});
test('BLE emits the existing bounded 20-byte full-duty move, then requires another explicit permission',async()=>{
  const {c,t,frames,time}=await fixture();try{
    await c.configure(settings);await c.arm(0,checks);time(200);await c.drive(1,1);
    const frame=frames.find(f=>f[1]===OPS.MOVE)!;assert.equal(frame.length,20);assert.equal(frame[10],100);assert.equal(frame[11],100);assert.equal(frame[16],5);
    assert.equal(new DataView(frame.buffer).getUint16(17,true),100);assert.equal(c.permitted,false);assert.equal(t.core.state.left,100);
    time(301);await c.pump();assert.equal(c.status?.left,0);assert.equal(c.status?.armed,false);
    const count=frames.filter(f=>f[1]===OPS.MOVE).length;await c.drive(1,1);assert.equal(frames.filter(f=>f[1]===OPS.MOVE).length,count);
    await c.stop();assert.equal(c.permitted,false);assert.equal(t.core.state.right,0);
  }finally{c.disconnect();}
});
test('release before the direction dwell cancels the reserved BLE move without a false failure',async()=>{
  const {c,frames,time}=await fixture();try{
    await c.configure(settings);await c.arm(0,checks);time(200);
    const pending=c.drive(1,1);await c.stop();await pending;
    assert.equal(frames.some(f=>f[1]===OPS.MOVE),false);assert.equal(c.permitted,false);assert.equal(c.error,'');
  }finally{c.disconnect();}
});
test('BLE emergency stop remains latched until reset and does not restore permission',async()=>{
  const {c,time}=await fixture();try{
    await c.configure(settings);await c.arm(0,checks);time(200);await c.drive(1,0);await c.stop(true);
    assert.equal(c.status?.estop,true);assert.equal(c.status?.left,0);await assert.rejects(()=>c.arm(0,checks));
    await c.reset();assert.equal(c.status?.estop,false);assert.equal(c.permitted,false);
  }finally{c.disconnect();}
});
test('BLE reboot cancels waiting permission and requires reconnection',async()=>{
  const {c,t,time}=await fixture();try{
    await c.configure(settings);await c.arm(0,checks);time(400);t.reboot();await c.pump();
    assert.equal(c.connected,false);assert.equal(c.permitted,false);assert.match(c.error,/再起動|restart/);
  }finally{c.disconnect();}
});
test('an unsupported firmware cannot be used as the deployed 1.8 profile',async()=>{
  const t=new MockTransport(false,true);Object.assign(t.core.state,{firmware:'colon-motor-1.7.0',patternsVersion:5});const c=new ColonBleController(()=>{},t,false);try{
    await c.connect();assert.equal(c.connected,false);assert.equal(c.permitted,false);assert.match(c.error,/1.8.0/);
  }finally{c.disconnect();}
});
test('legacy left/right correction and independent wheel commands remain explicit',()=>{
  assert.deepEqual(bleDirections(-1,1),[100,-100]);assert.deepEqual(bleDirections(1,-1),[-100,100]);
  assert.deepEqual(bleDirections(1,0),[100,0]);assert.throws(()=>bleDirections(10,1));
});
test('BLE waits for the firmware connection snapshot and disconnects if the device later reports loss',async()=>{
  const t=new MockTransport(false,true);let reads=0;const read=t.read.bind(t);
  t.read=async()=>{const s=await read();return ++reads===1?{...s,connected:false}:s;};
  const c=new ColonBleController(()=>{},t,false);try{
    await c.connect();assert.ok(c.connected);assert.ok(reads>=2);
    t.core.state.connected=false;await c.pump();assert.equal(c.connected,false);assert.equal(c.permitted,false);
  }finally{c.disconnect();}
});
test('a normal short pulse ending before readback is not reported as a missing move',async()=>{
  let now=0;const t=new MockTransport(false,true);t.now=()=>now;
  const read=t.read.bind(t);t.read=async()=>{now+=120;t.core.tick(now);return read();};
  const c=new ColonBleController(()=>{},t,false);try{
    await c.connect();await c.configure(settings);await c.arm(0,checks);now=250;await c.drive(1,1);
    assert.equal(c.error,'');assert.equal(c.permitted,false);assert.equal(t.core.state.left,0);
  }finally{c.disconnect();}
});
