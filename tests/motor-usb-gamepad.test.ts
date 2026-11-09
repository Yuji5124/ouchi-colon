import test from 'node:test';
import assert from 'node:assert/strict';
import {PadGate,defaultPadMapping,padInputs,validPadMapping} from '../src/motor/usb-gamepad.ts';
const mapping=defaultPadMapping(false);
test('USBcon: axes and standard buttons decode with dead zone',()=>{
 assert.deepEqual(padInputs({id:'pad',index:0,connected:true,mapping:'',buttons:[{pressed:true,value:1}],axes:[-1,0.3,NaN]}),['b0','a0-']);
 assert.equal(defaultPadMapping(true).left,'b14');assert.ok(validPadMapping(mapping));assert.equal(validPadMapping({...mapping,right:mapping.left}),false);
});
test('USBcon: startup held input requires neutral then exactly one command until release',()=>{
 const gate=new PadGate();assert.deepEqual(gate.sample(['a1-'],mapping,true),{});gate.sample([],mapping,true);
 assert.deepEqual(gate.sample(['a1-'],mapping,true),{start:'forward'});assert.deepEqual(gate.sample(['a1-'],mapping,true),{});
 assert.deepEqual(gate.sample([],mapping,true),{stop:true});assert.deepEqual(gate.sample(['a1+'],mapping,true),{start:'backward'});
});
test('USBcon: stops and reconnect never resume a held direction',()=>{
 const gate=new PadGate();gate.sample([],mapping,true);gate.sample(['a0-'],mapping,true);
 assert.deepEqual(gate.sample(['a0-'],mapping,false),{stop:true});assert.deepEqual(gate.sample(['a0-'],mapping,true),{});
 gate.sample([],mapping,true);assert.deepEqual(gate.sample(['a0+'],mapping,true),{start:'right'});gate.reset();assert.deepEqual(gate.sample(['a0+'],mapping,true),{});
});
test('USBcon: face buttons, diagonal and direct reversal stop and require neutral',()=>{
 for(const inputs of [['a0+','a1-'],['b0','a1-'],['a1+']]){const gate=new PadGate();gate.sample([],mapping,true);gate.sample(['a1-'],mapping,true);assert.deepEqual(gate.sample(inputs,mapping,true),{stop:true});assert.deepEqual(gate.sample(['a1-'],mapping,true),{});}
});
