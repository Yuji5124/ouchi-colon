export const PATTERN_IDS=['forward25','forward50','forward75','backward25','backward50','backward75','right15','right30','right45','left15','left30','left45'] as const;
export const PROGRAM_IDS=['forward100','backward100','right15','right30','right45','left15','left30','left45'] as const;
export type PatternId=typeof PATTERN_IDS[number]|typeof PROGRAM_IDS[number];
export interface PatternConfig {speed:25|50|75|100;durationMs:number;}
export type PatternTable=Record<PatternId,PatternConfig>;
export const patternIds=(version:1|2|undefined):readonly PatternId[]=>version===2?PROGRAM_IDS:PATTERN_IDS;
export const fixedProgram=(id:PatternId)=>id==='forward100'||id==='backward100';
export function defaultPatterns():PatternTable {
  return {...Object.fromEntries(PATTERN_IDS.map((id,i)=>[id,{speed:i<6?25*(i%3+1):25,durationMs:i<6?200:0}])),
    forward100:{speed:100,durationMs:1000},backward100:{speed:100,durationMs:1000}} as PatternTable;
}
export function validPattern(id:PatternId,p:PatternConfig){
  if(fixedProgram(id))return p?.speed===100&&p.durationMs===1000;
  const i=patternIds(1).indexOf(id);
  return i>=0&&p&&[25,50,75].includes(p.speed)&&(i>=6||p.speed===25*(i%3+1))&&Number.isInteger(p.durationMs)&&(p.durationMs===0||(p.durationMs>=50&&p.durationMs<=500));
}
export function parsePatterns(value:unknown,expectedVersion?:1|2):PatternTable {
  const v=value as {version?:number;slots?:number[][]};
  if((v?.version!==1&&v?.version!==2)||(expectedVersion!==undefined&&v.version!==expectedVersion))throw new Error('パターン形式が違います。');
  const ids=patternIds(v.version);
  if(!Array.isArray(v.slots)||v.slots.length!==ids.length)throw new Error('パターン形式が違います。');
  const out=defaultPatterns();
  ids.forEach((id,i)=>{
    const slot=v.slots![i];
    if(!Array.isArray(slot)||slot.length!==2)throw new Error('パターン値が不正です。');
    const [speed,durationMs]=slot,p={speed,durationMs} as PatternConfig;
    if(!validPattern(id,p))throw new Error('パターン値が不正です。');
    out[id]=p;
  });
  return out;
}
export function patternLabel(id:PatternId){return id.startsWith('forward')?`前進 ${id.slice(7)}%`:id.startsWith('backward')?`後進 ${id.slice(8)}%`:`${id.startsWith('right')?'右':'左'} ${id.replace(/\D/g,'')}°（時間校正）`;}
export function patternOutput(id:PatternId,speed:number):[number,number] {return id.startsWith('forward')?[speed,speed]:id.startsWith('backward')?[-speed,-speed]:id.startsWith('right')?[speed,-speed]:[-speed,speed];}
export function readLocalPatterns():PatternTable {const defaults=defaultPatterns();try{const value=JSON.parse(localStorage.getItem('colon-motor-patterns-v1')??'null');for(const id of Object.keys(defaults) as PatternId[])if(validPattern(id,value?.[id]))defaults[id]=value[id];}catch{/* Use defaults when local storage is unavailable. */}return defaults;}
