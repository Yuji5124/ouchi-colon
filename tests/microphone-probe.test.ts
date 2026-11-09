import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeMicrophone,recognitionServiceGuidance,type ProbeStream} from '../src/speech/microphone-probe.ts';
const stream=()=>{let stopped=0;const track={readyState:'live',stop:()=>{stopped++;}};return {value:{getTracks:()=>[track],getAudioTracks:()=>[track]},stopped:()=>stopped};};
test('microphone probe obtains audio only and closes it without recognition or recording',async()=>{
  const s=stream();let constraints:unknown;const r=await probeMicrophone(async c=>{constraints=c;return s.value;},{secure:true});
  assert.deepEqual(constraints,{audio:true,video:false});assert.equal(r.ok,true);assert.equal(s.stopped(),1);assert.match(r.message,/音声認識は次/);
});
test('microphone errors do not masquerade as recognition-service permission',async()=>{
  const r=await probeMicrophone(async()=>{throw {name:'NotAllowedError',message:'private details'};},{secure:true});
  assert.equal(r.ok,false);assert.equal(r.code,'NotAllowedError');assert.doesNotMatch(r.message,/private details/);
  assert.match(recognitionServiceGuidance('service-not-allowed')!,/マイク単体の許可とは別/);assert.equal(recognitionServiceGuidance('network'),null);
});
test('timeout closes an input granted after the probe has already finished',async()=>{
  const s=stream();let resolve!:(s:ProbeStream)=>void;
  const pending=probeMicrophone(()=>new Promise(r=>resolve=r),{secure:true,timeoutMs:5});
  assert.equal((await pending).code,'TimeoutError');resolve(s.value);await Promise.resolve();await Promise.resolve();assert.equal(s.stopped(),1);
});
test('cancellation closes late permission and an already-cancelled request never opens microphone',async()=>{
  const abort=new AbortController(),s=stream();let resolve!:(s:ProbeStream)=>void;
  const pending=probeMicrophone(()=>new Promise(r=>resolve=r),{secure:true,signal:abort.signal});abort.abort();
  assert.equal((await pending).code,'AbortError');resolve(s.value);await Promise.resolve();await Promise.resolve();assert.equal(s.stopped(),1);
  let calls=0;await probeMicrophone(async()=>{calls++;return s.value;},{secure:true,signal:abort.signal});assert.equal(calls,0);
});
test('insecure, missing API and ended input cannot be reported as microphone success',async()=>{
  assert.equal((await probeMicrophone(undefined,{secure:true})).code,'unsupported');
  assert.equal((await probeMicrophone(undefined,{secure:false})).code,'insecure');
  let stopped=0;const track={readyState:'ended',stop:()=>{stopped++;}};
  const r=await probeMicrophone(async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]}),{secure:true});assert.equal(r.ok,false);assert.equal(stopped,1);
});
