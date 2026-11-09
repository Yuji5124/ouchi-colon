import test from 'node:test';
import assert from 'node:assert/strict';
import {startNotifFixture} from '../scripts/lib/notif-fixture.mjs';
import {makeFrame,INITIAL_SETTINGS,OPS} from '../src/motor/protocol.ts';

test('Notif host: token, explicit connect, exclusive ownership, no automatic motion or heartbeat',async()=>{
 const f=await startNotifFixture();
 const call=async(op:string,body={},token=f.token)=>{const response=await fetch(f.base+'/api/motor/'+op,{method:'POST',headers:{'x-colon-token':token},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 try{
  assert.equal((await call('scan',{},'bad')).status,403);assert.equal(f.ops.length,0);
  assert.equal((await call('scan')).data.result[0].id,'test-atom');
  const connected=await call('connect',{device:'test-atom'}),connection=connected.data.connection;
  assert.equal(connected.data.result.firmware,'colon-motor-1.9.0');assert.equal(connected.data.result.armed,false);assert.deepEqual(f.ops,['scan','connect']);
  assert.equal((await call('connect',{device:'test-atom'})).status,502);
  assert.equal((await call('read',{connection:'wrong'})).status,502);
  assert.equal((await call('write',{connection,frame:[1,3]})).status,502);
  assert.equal(f.ops.includes('write'),false);
  await new Promise(r=>setTimeout(r,120));
  const frame=makeFrame(connected.data.result,OPS.MOVE,1,{...INITIAL_SETTINGS,signalOnly:false,rcTest:true,directControl:true,actionStep:true,pulseMs:2000},100,100);
  assert.equal((await call('write',{connection,frame:Array.from(frame)})).status,200);
  assert.equal((await call('read',{connection})).data.result.left,100);
  await new Promise(r=>setTimeout(r,1020));
  assert.equal((await call('read',{connection})).data.result.stopReason,'heartbeat-timeout');
  await call('disconnect',{connection});assert.equal((await call('read',{connection})).status,502);
 }finally{await f.close();}
});
test('Notif host: static path traversal is rejected',async()=>{
 const f=await startNotifFixture();try{const response=await fetch(f.base+'/ouchi-colon/%2e%2e%2fpackage.json');assert.equal(response.status,403);}finally{await f.close();}
});
