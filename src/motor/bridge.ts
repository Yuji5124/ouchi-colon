import {actionForCommand,validActionId,type ActionId,type FacePose} from './actions.ts';
export const COLON_MOTOR_CHANNEL='ouchi-colon-motor-v1';
export const COLON_EVENTS=['IDLE','HAPPY','TALK','THINK','SURPRISE','SAD','SLEEP','SEARCH'] as const;
export type ColonEvent=typeof COLON_EVENTS[number];
export interface ColonMotorEvent {type:'colon-expression';expression:ColonEvent;at:number;id:string;}
let channel:BroadcastChannel|null=null;
/** Symbolic expressions and normalized gaze only; no raw video or utterance text. */
export function publishMotorExpression(expression:string){
  if(!COLON_EVENTS.includes(expression as ColonEvent))return;
  // Optional motor integration must never interrupt the existing face/conversation.
  const event={type:'colon-expression' as const,expression:expression as ColonEvent,at:Date.now(),id:typeof crypto?.randomUUID==='function'?crypto.randomUUID():`${Date.now()}-${Math.random()}`};
  try{window.dispatchEvent(new CustomEvent('colon-motor-expression',{detail:event}));}catch{/* No browser event surface. */}
  try{if(typeof BroadcastChannel!=='undefined'){channel??=new BroadcastChannel(COLON_MOTOR_CHANNEL);channel.postMessage(event);}}catch{/* Storage/privacy policy may deny channels. */}
}
export function validColonEvent(value:unknown,now=Date.now()):value is ColonMotorEvent {const v=value as ColonMotorEvent;return !!v&&v.type==='colon-expression'&&COLON_EVENTS.includes(v.expression)&&typeof v.id==='string'&&v.id.length<=100&&Number.isFinite(v.at)&&now-v.at>=0&&now-v.at<=1000;}

export interface MotorSpeaker {ready:()=>string;speak:(text:string,signal:AbortSignal)=>Promise<void>;}
type ActionHandler=(id:ActionId,completed?:(success:boolean)=>void)=>boolean;
let actionHandler:ActionHandler|null=null;
let motorSpeaker:MotorSpeaker|null=null;
export function registerMotorActionHandler(handler:ActionHandler){actionHandler=handler;return()=>{if(actionHandler===handler)actionHandler=null;};}
export function requestMotorAction(id:ActionId,completed?:(success:boolean)=>void){return validActionId(id)&&!!actionHandler?.(id,completed);}
export function requestMotorCommand(text:string,completed?:(success:boolean)=>void){const id=actionForCommand(text);return id!==null&&requestMotorAction(id,completed);}
export function registerMotorSpeaker(speaker:MotorSpeaker){motorSpeaker=speaker;}
export function getMotorSpeaker(){return motorSpeaker;}
export interface MotorGazeEvent {type:'colon-motor-gaze';pose:FacePose;id:string;at:number;}
export interface MotorUnknownEvent {type:'colon-motor-unknown';id:string;at:number;}
export type MotorSignal=ColonMotorEvent|MotorGazeEvent|MotorUnknownEvent;
function publishMotorSignal(event:MotorGazeEvent|MotorUnknownEvent){
  try{window.dispatchEvent(new CustomEvent(event.type,{detail:event}));}catch{}
  try{if(typeof BroadcastChannel!=='undefined'){channel??=new BroadcastChannel(COLON_MOTOR_CHANNEL);channel.postMessage(event);}}catch{}
}
export function publishMotorGaze(detected:boolean,x:number,size:number|null){
  if(!Number.isFinite(x)||Math.abs(x)>1||(size!==null&&(!Number.isFinite(size)||size<=0||size>1)))return;
  const at=Date.now();
  publishMotorSignal({type:'colon-motor-gaze',pose:{detected,x,size,at},at,id:typeof crypto?.randomUUID==='function'?crypto.randomUUID():String(at)});
}
export function publishMotorUnknown(){
  const at=Date.now();
  publishMotorSignal({type:'colon-motor-unknown',at,id:typeof crypto?.randomUUID==='function'?crypto.randomUUID():String(at)});
}
export function validMotorSignal(value:unknown,now=Date.now()):value is MotorSignal{
  if(validColonEvent(value,now))return true;
  const event=value as MotorGazeEvent|MotorUnknownEvent;
  if(!event||typeof event.id!=='string'||event.id.length>100||!Number.isFinite(event.at)||now<event.at||now-event.at>1000)return false;
  if(event.type==='colon-motor-unknown')return true;
  if(event.type!=='colon-motor-gaze')return false;
  const p=event.pose;
  return !!p&&typeof p.detected==='boolean'&&Number.isFinite(p.x)&&Math.abs(p.x)<=1&&p.at===event.at
    &&(p.size===null||(Number.isFinite(p.size)&&p.size>0&&p.size<=1));
}
export function subscribeMotorSignals(callback:(event:MotorSignal)=>void){
  const seen=new Set<string>();
  const receive=(value:unknown)=>{
    if(!validMotorSignal(value)||seen.has(value.id))return;
    seen.add(value.id);if(seen.size>150)seen.delete(seen.values().next().value!);
    callback(value);
  };
  const local=(event:Event)=>receive((event as CustomEvent).detail);
  for(const name of ['colon-motor-expression','colon-motor-gaze','colon-motor-unknown'])window.addEventListener(name,local);
  let incoming:BroadcastChannel|null=null;
  try{incoming=new BroadcastChannel(COLON_MOTOR_CHANNEL);incoming.onmessage=event=>receive(event.data);}catch{}
  return()=>{incoming?.close();for(const name of ['colon-motor-expression','colon-motor-gaze','colon-motor-unknown'])window.removeEventListener(name,local);};
}
