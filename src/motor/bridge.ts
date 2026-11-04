export const COLON_MOTOR_CHANNEL='ouchi-colon-motor-v1';
export const COLON_EVENTS=['IDLE','HAPPY','TALK','THINK','SURPRISE','SAD','SLEEP','SEARCH'] as const;
export type ColonEvent=typeof COLON_EVENTS[number];
export interface ColonMotorEvent {type:'colon-expression';expression:ColonEvent;at:number;id:string;}
let channel:BroadcastChannel|null=null;
/** Only symbolic expression events, never speech, child utterances or personal data. */
export function publishMotorExpression(expression:string){
  if(!COLON_EVENTS.includes(expression as ColonEvent))return;
  // Optional motor integration must never interrupt the existing face/conversation.
  const event={type:'colon-expression' as const,expression:expression as ColonEvent,at:Date.now(),id:typeof crypto?.randomUUID==='function'?crypto.randomUUID():`${Date.now()}-${Math.random()}`};
  try{window.dispatchEvent(new CustomEvent('colon-motor-expression',{detail:event}));}catch{/* No browser event surface. */}
  try{if(typeof BroadcastChannel!=='undefined'){channel??=new BroadcastChannel(COLON_MOTOR_CHANNEL);channel.postMessage(event);}}catch{/* Storage/privacy policy may deny channels. */}
}
export function validColonEvent(value:unknown,now=Date.now()):value is ColonMotorEvent {const v=value as ColonMotorEvent;return !!v&&v.type==='colon-expression'&&COLON_EVENTS.includes(v.expression)&&typeof v.id==='string'&&v.id.length<=100&&Number.isFinite(v.at)&&now-v.at>=0&&now-v.at<=1000;}
