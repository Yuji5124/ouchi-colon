export const MOTOR_SERVICE='b4c00001-70f0-4c21-a560-cc0100000001';
export const MOTOR_COMMAND='b4c00002-70f0-4c21-a560-cc0100000001';
export const MOTOR_STATUS='b4c00003-70f0-4c21-a560-cc0100000001';
export const MOTOR_PATTERNS='b4c00004-70f0-4c21-a560-cc0100000001';
export const OPS={ARM:1,DISARM:2,MOVE:3,STOP:4,HEARTBEAT:5,CONFIG:6,ESTOP:7,RESET_ESTOP:8,PATTERN:9,SAVE_PATTERN:10} as const;
export type Op=typeof OPS[keyof typeof OPS];
export interface MotorStatus {
  protocol:1;firmware:string;bootId:number;bootCount:number|null;uptimeMs:number;resetReason:string;
  nonce:number;seq:number;connected:boolean;gpioReady:boolean;armed:boolean;estop:boolean;powerQualified:boolean;signalOnly:boolean;
  left:number;right:number;physicalLeft:number;physicalRight:number;stopReason:string;heartbeatAgeMs:number;pulseMs:number;frequency:number;
  patternsVersion?:1|2|3|4|5;
  singleTest?:boolean;
  lcd?:boolean;
}
export interface MotorSettings {frequency:number;pulseMs:number;invertLeft:boolean;invertRight:boolean;signalOnly:boolean;singleTest?:boolean;rcTest?:boolean;directControl?:boolean;actionStep?:boolean;}
export const RC_MAX_DUTY=75;
export function isBootFirmware(status:MotorStatus|null|undefined){
  return status?.firmware==='colon-motor-1.4.0'||status?.firmware==='colon-motor-1.4.1'
    ||status?.firmware==='colon-motor-1.4.2';
}
export function isActionFirmware(status:MotorStatus|null|undefined){return status?.firmware==='colon-motor-1.7.0';}
export function isCorrectedTurnFirmware(status:MotorStatus|null|undefined){return status?.firmware==='colon-motor-1.6.1'||isActionFirmware(status);}
export function isDirectFirmware(status:MotorStatus|null|undefined){return status?.firmware==='colon-motor-1.6.0'||isCorrectedTurnFirmware(status);}
export function isFullPowerFirmware(status:MotorStatus|null|undefined){return status?.firmware==='colon-motor-1.5.1'||isDirectFirmware(status);}
export function isProgramFirmware(status:MotorStatus|null|undefined){return status?.firmware==='colon-motor-1.5.0'||isFullPowerFirmware(status);}
export function isRcFirmware(status:MotorStatus|null|undefined){return status?.firmware==='colon-motor-1.3.0'||isProgramFirmware(status);}
export const INITIAL_SETTINGS:MotorSettings={frequency:1000,pulseMs:200,invertLeft:false,invertRight:false,signalOnly:true};
export function validSettings(s:MotorSettings){
  if(s.singleTest&&(s.rcTest||s.signalOnly||s.frequency!==1000||s.pulseMs>100))return false;
  if(s.rcTest&&(s.signalOnly||s.frequency!==1000))return false;
  if(s.directControl&&(!s.rcTest||s.singleTest||s.signalOnly))return false;
  if(s.actionStep&&!s.directControl)return false;
  return Number.isInteger(s.frequency)&&s.frequency>=100&&s.frequency<=20000&&Number.isInteger(s.pulseMs)&&s.pulseMs>=50&&s.pulseMs<=(s.actionStep?2000:500);
}
export function makeFrame(status:MotorStatus,op:Op,seq:number,settings:MotorSettings,left=0,right=0):Uint8Array {
  if(!validSettings(settings)||![left,right].every(v=>Number.isInteger(v)&&v>=-100&&v<=100)||!Number.isInteger(seq)||seq<=0||seq>0xffffffff)throw new Error('PWM・周波数・パルスの指定が不正です。');
  if(settings.rcTest&&op===OPS.MOVE&&(![left,right].some(Boolean)||(!isProgramFirmware(status)&&Math.max(Math.abs(left),Math.abs(right))>RC_MAX_DUTY)))throw new Error('ラジコン試験の出力指定が不正です。');
  if(isFullPowerFirmware(status)&&op===OPS.MOVE&&[left,right].some(v=>v!==0&&Math.abs(v)!==100))throw new Error('出力は100%固定です。');
  if(settings.directControl&&!isDirectFirmware(status))throw new Error('直接操作には走行プログラム1.6.0を書き込んでください。');
  if(settings.actionStep&&!isActionFirmware(status))throw new Error('A01〜A17には走行プログラム1.7.0が必要です。');
  const out=new Uint8Array(20),v=new DataView(out.buffer);out[0]=1;out[1]=op;v.setUint32(2,status.nonce,true);v.setUint32(6,seq,true);v.setInt8(10,left);v.setInt8(11,right);v.setUint16(12,settings.frequency,true);out[14]=(settings.invertLeft?1:0)|(settings.invertRight?2:0);out[15]=settings.directControl?0:15;out[16]=settings.actionStep?5:settings.directControl?4:settings.rcTest?3:settings.singleTest?2:settings.signalOnly?1:0;v.setUint16(17,settings.pulseMs,true);return out;
}
export function parseStatus(value:unknown):MotorStatus {
  const s=value as MotorStatus;
  if(!s||s.protocol!==1||!s.firmware?.startsWith('colon-motor-1.')||!['nonce','seq','uptimeMs','bootId','heartbeatAgeMs','pulseMs','frequency','left','right'].every(k=>typeof s[k as keyof MotorStatus]==='number'&&Number.isFinite(s[k as keyof MotorStatus]))||!['connected','gpioReady','armed','estop','powerQualified','signalOnly'].every(k=>typeof s[k as keyof MotorStatus]==='boolean'))throw new Error('対応するMotor Testファームウェアではありません。');
  if(s.lcd!==undefined&&typeof s.lcd!=='boolean')throw new Error('本体液晶の状態が不正です。');
  if(s.singleTest!==undefined&&typeof s.singleTest!=='boolean')throw new Error('単独試験モードの値が不正です。');
  if(s.singleTest&&(s.powerQualified||!s.firmware.startsWith('colon-motor-1.2.')))throw new Error('単独試験版の適合表示が不正です。');
  if((isRcFirmware(s)||isBootFirmware(s))&&(s.powerQualified||s.singleTest))throw new Error('試験ファームの適合表示が不正です。');
  if((s.patternsVersion!==undefined&&![1,2,3,4,5].includes(s.patternsVersion))||
    isProgramFirmware(s)!==(s.patternsVersion!==undefined&&s.patternsVersion>=2)||
    isFullPowerFirmware(s)!==(s.patternsVersion!==undefined&&s.patternsVersion>=3)||
    isCorrectedTurnFirmware(s)!==(s.patternsVersion!==undefined&&s.patternsVersion>=4)||
    isActionFirmware(s)!==(s.patternsVersion===5))throw new Error('走行プログラムのパターン形式が違います。');
  if(s.nonce<1||s.nonce>0xffffffff||s.seq<0||s.seq>0xffffffff||s.uptimeMs<0||Math.abs(s.left)>100||Math.abs(s.right)>100||typeof s.stopReason!=='string'||typeof s.resetReason!=='string'||!(s.bootCount===null||Number.isInteger(s.bootCount)))throw new Error('ステータスの値が不正です。');
  return s;
}
export function direction(name:string,l:number,r:number,correctedTurns=false):[number,number] {
  const map:Record<string,[number,number]>={lf:[l,0],lr:[-l,0],rf:[0,r],rr:[0,-r],forward:[l,r],backward:[-l,-r],left:correctedTurns?[l,-r]:[-l,r],right:correctedTurns?[-l,r]:[l,-r]};
  if(!map[name])throw new Error('不明な操作です。');return map[name];
}
export function gpioConflict(pins:number[],reserved:number[]=[1,2,15,16,17,21,33,34,38,39,41]) {return pins.length!==4||new Set(pins).size!==4||pins.some(p=>!Number.isInteger(p)||p<5||p>8||reserved.includes(p));}
