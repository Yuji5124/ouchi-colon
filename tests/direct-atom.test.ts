import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atomHttpsOrigin,DirectAtomTransport} from '../src/robot/direct-atom.ts';
import {MockMotorCore} from '../src/motor/mock-core.ts';
function status(){return {...new MockMotorCore().connect(0),source:'device',firmware:'colon-phone',armed:false,active:false} as const;}
const code='0123456789abcdef';
test('direct phone accepts trusted HTTPS local endpoints only',()=>{
  assert.equal(atomHttpsOrigin('https://colon-atom.local'),'https://colon-atom.local');
  assert.equal(atomHttpsOrigin('https://192.168.1.20'),'https://192.168.1.20');
  for(const url of ['http://colon-atom.local','https://example.com','https://colon-atom.local:8443','https://user:pass@colon-atom.local','https://colon-atom.local/api','https://colon-atom.local?token=x','https://172.32.0.1'])assert.throws(()=>atomHttpsOrigin(url));
  assert.throws(()=>new DirectAtomTransport('https://colon-atom.local','short'));
});
test('phone pairs directly and commands never resend the pairing secret',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const transport=new DirectAtomTransport('https://colon-atom.local',code,async(url,init)=>{calls.push({url:String(url),init:init!});return Response.json(calls.length===1?{token:'a'.repeat(32),status:status()}:{...status(),lastSeq:1});});
  await transport.connect();await transport.send({type:'HEARTBEAT',seq:1});
  assert.equal(calls[0]!.url,'https://colon-atom.local/phone/session');assert.equal(calls[1]!.url,'https://colon-atom.local/phone/command');
  assert.equal((calls[0]!.init.headers as Record<string,string>)['X-Colon-Pair'],code);
  assert.equal((calls[1]!.init.headers as Record<string,string>)['X-Colon-Pair'],undefined);
  assert.equal((calls[1]!.init.headers as Record<string,string>)['X-Colon-Session'],'a'.repeat(32));
  assert.equal(calls[0]!.init.credentials,'omit');assert.equal(calls[0]!.init.redirect,'error');
});
test('old command acknowledgements and unsafe sessions are rejected',async()=>{
  let count=0;
  const transport=new DirectAtomTransport('https://colon-atom.local',code,async()=>Response.json(++count===1?{token:'a'.repeat(32),status:status()}:status()));
  await transport.connect();await assert.rejects(()=>transport.send({type:'DRIVE',seq:5,left:1,right:1,press:1}),/stale-status/);
  const unsafe=new DirectAtomTransport('https://colon-atom.local',code,async()=>Response.json({token:'a'.repeat(32),status:{...status(),armed:true}}));
  await assert.rejects(()=>unsafe.connect(),/unsafe-session/);
});
test('cancelling a pending phone session releases its late token and never arms',async()=>{
  let resolve!:(value:Response)=>void;const calls:string[]=[];
  const transport=new DirectAtomTransport('https://colon-atom.local',code,async url=>{calls.push(String(url));if(calls.length===1)return new Promise(r=>resolve=r);return Response.json(status());});
  const pending=transport.connect();transport.disconnect();resolve(Response.json({token:'a'.repeat(32),status:status()}));
  await assert.rejects(()=>pending,/connect-cancelled/);assert.equal(calls[1],'https://colon-atom.local/phone/disconnect');
});
test('certificate/network errors are actionable and never downgrade to HTTP',async()=>{
  const urls:string[]=[];const transport=new DirectAtomTransport('https://colon-atom.local',code,async url=>{urls.push(String(url));throw new TypeError('fetch failed');});
  await assert.rejects(()=>transport.connect(),/証明書/);assert.equal(urls.length,1);assert.ok(urls[0]!.startsWith('https:'));
});
test('emergency stop is urgent and display sends only allowlisted metadata',async()=>{
  const calls:RequestInit[]=[];const transport=new DirectAtomTransport('https://colon-atom.local',code,async(_url,init)=>{calls.push(init!);return Response.json(calls.length===1?{token:'a'.repeat(32),status:status()}:{...status(),lastSeq:2});});
  await transport.connect();await transport.send({type:'ESTOP',seq:2},true);await transport.display('arbitrary transcript');
  assert.equal(calls[1]!.keepalive,true);assert.deepEqual(JSON.parse(String(calls[2]!.body)),{emotion:'NORMAL'});
});
