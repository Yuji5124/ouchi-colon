import {patternOutput,validPattern,type PatternId,type PatternTable} from './patterns.ts';

export const ACTION_IDS=['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10','A11','A12','A13','A14','A15','A16','A17'] as const;
export type ActionId=typeof ACTION_IDS[number];
export const ACTIONS:ReadonlyArray<{id:ActionId;label:string;description:string}>=[
  {id:'A01',label:'顔へ・右15°',description:'右15°の校正時間で旋回'},
  {id:'A02',label:'顔へ・右30°',description:'右30°の校正時間で旋回'},
  {id:'A03',label:'顔へ・右45°',description:'右45°の校正時間で旋回'},
  {id:'A04',label:'顔へ・左15°',description:'左15°の校正時間で旋回'},
  {id:'A05',label:'顔へ・左30°',description:'左30°の校正時間で旋回'},
  {id:'A06',label:'顔へ・左45°',description:'左45°の校正時間で旋回'},
  {id:'A07',label:'こっちきて',description:'視線へ旋回 → 前進2秒 →「来たよ〜」'},
  {id:'A08',label:'うれしい1',description:'左旋回1秒 → 右旋回1秒'},
  {id:'A09',label:'うれしい2',description:'後進1秒 → 前進1秒'},
  {id:'A10',label:'よくわからない',description:'後進0.5秒×3 → 前進0.5秒×3（間に停止）'},
  {id:'A11',label:'右向いて',description:'右90°の校正時間で旋回'},
  {id:'A12',label:'左向いて',description:'左90°の校正時間で旋回'},
  {id:'A13',label:'ラジコン・前',description:'前進（ラジコンの最大時間）'},
  {id:'A14',label:'ラジコン・後ろ',description:'後進（ラジコンの最大時間）'},
  {id:'A15',label:'ラジコン・左90°',description:'A12と同じ左90°'},
  {id:'A16',label:'ラジコン・右90°',description:'A11と同じ右90°'},
  {id:'A17',label:'止まれ',description:'動作と待機中の続きを取り消して停止'},
];
export interface FacePose {detected:boolean;x:number;size:number|null;at:number;}
export interface ActionSettings {pauseMs:number;deadZone:number;medium:number;large:number;happy:'A08'|'A09';}
export const DEFAULT_ACTION_SETTINGS:ActionSettings={pauseMs:200,deadZone:0.12,medium:0.35,large:0.65,happy:'A08'};
export interface ActionMove {left:number;right:number;durationMs:number;gapMs:number;}
export interface ActionPlan {moves:ActionMove[];speech?:string;requiresFace:boolean;}
export function validActionId(value:unknown):value is ActionId {return typeof value==='string'&&(ACTION_IDS as readonly string[]).includes(value);}
export function validActionSettings(s:ActionSettings){
  return !!s&&Number.isInteger(s.pauseMs)&&s.pauseMs>=100&&s.pauseMs<=2000
    &&[s.deadZone,s.medium,s.large].every(Number.isFinite)
    &&s.deadZone>=0.02&&s.deadZone<s.medium&&s.medium<s.large&&s.large<=1
    &&(s.happy==='A08'||s.happy==='A09');
}
export function freshFace(face:FacePose|null,now=Date.now()):face is FacePose {
  return !!face&&face.detected&&Number.isFinite(face.x)&&Math.abs(face.x)<=1
    &&Number.isFinite(face.at)&&now>=face.at&&now-face.at<=1000
    &&(face.size===null||(Number.isFinite(face.size)&&face.size>0&&face.size<=1));
}
export function faceAction(face:FacePose|null,s:ActionSettings,now=Date.now()):ActionId|null{
  if(!freshFace(face,now))throw new Error('顔の位置が未取得または古い状態です。顔検出を開始してください。');
  // Apparent face size is a distance proxy, not a measurement in metres.
  const factor=face.size===null?1:face.size<0.15?1.25:face.size>0.35?0.75:1;
  const error=Math.abs(face.x)*factor;
  if(error<s.deadZone)return null;
  const index=error>=s.large?2:error>=s.medium?1:0;
  return ACTION_IDS[(face.x>=0?0:3)+index];
}
export function actionForCommand(text:string):ActionId|null{
  const normalized=text.normalize('NFKC').replace(/[\s、。！!？?]/g,'');
  if(/^(?:止まれ|とまれ|止まって|とまって|ストップ)$/.test(normalized))return 'A17';
  if(/^(?:こっちきて|こっちにきて|こっち来て|こっちに来て)$/.test(normalized))return 'A07';
  if(/^(?:右向いて|右を向いて|みぎむいて)$/.test(normalized))return 'A11';
  if(/^(?:左向いて|左を向いて|ひだりむいて)$/.test(normalized))return 'A12';
  if(/^(?:前|前進|まえ|前に進む)$/.test(normalized))return 'A13';
  if(/^(?:後ろ|後進|うしろ|後ろに進む)$/.test(normalized))return 'A14';
  if(/^(?:左|ひだり)$/.test(normalized))return 'A15';
  if(/^(?:右|みぎ)$/.test(normalized))return 'A16';
  return null;
}
export function planAction(id:ActionId,table:PatternTable,settings:ActionSettings,face:FacePose|null,manualMs:number,now=Date.now()):ActionPlan{
  if(!validActionId(id)||!validActionSettings(settings))throw new Error('動作IDまたは設定が不正です。');
  const moves:ActionMove[]=[];
  const move=(left:number,right:number,durationMs:number,gapMs=100)=>moves.push({left,right,durationMs,gapMs});
  const turn=(pattern:PatternId)=>{
    const config=table[pattern];
    if(!validPattern(pattern,config,6)||!config.durationMs)throw new Error(pattern+'の旋回時間を校正してAtomへ保存してください。');
    const [left,right]=patternOutput(pattern,100,true);move(left,right,config.durationMs);
  };
  const turns:Partial<Record<ActionId,PatternId>>={A01:'right15',A02:'right30',A03:'right45',A04:'left15',A05:'left30',A06:'left45',A11:'right90',A12:'left90',A15:'left90',A16:'right90'};
  if(turns[id])turn(turns[id]!);
  else if(id==='A07'){
    const selected=faceAction(face,settings,now);
    if(selected)turn(turns[selected]!);
    move(100,100,2000);
  }else if(id==='A08'){move(100,-100,1000);move(-100,100,1000);}
  else if(id==='A09'){move(-100,-100,1000);move(100,100,1000);}
  else if(id==='A10'){
    for(const sign of [-1,1])for(let n=0;n<3;n++)move(sign*100,sign*100,500,settings.pauseMs);
  }else if(id==='A13'||id==='A14'){
    if(!Number.isInteger(manualMs)||manualMs<50||manualMs>500)throw new Error('ラジコンの最大時間は50〜500msです。');
    const speed=id==='A13'?100:-100;move(speed,speed,manualMs);
  }
  return {moves,speech:id==='A07'?'来たよ〜':undefined,requiresFace:id==='A07'};
}
