export const PATTERN_IDS=['forward25','forward50','forward75','backward25','backward50','backward75','right15','right30','right45','left15','left30','left45'] as const;
export const PROGRAM_IDS=['forward100','backward100','right15','right30','right45','left15','left30','left45'] as const;
export const ACTION_PATTERN_IDS=[...PROGRAM_IDS,'right90','left90'] as const;
export type PatternId=typeof PATTERN_IDS[number]|typeof ACTION_PATTERN_IDS[number];
export interface PatternConfig {speed:25|50|75|100;durationMs:number;}
export type PatternTable=Record<PatternId,PatternConfig>;
export type PatternVersion=1|2|3|4|5;
export const patternIds=(version:PatternVersion|undefined):readonly PatternId[]=>version===5?ACTION_PATTERN_IDS:version!==undefined&&version>=2?PROGRAM_IDS:PATTERN_IDS;
export const turn90=(id:PatternId)=>id==='right90'||id==='left90';
export const fixedProgram=(id:PatternId)=>id==='forward100'||id==='backward100';
export function defaultPatterns(version:PatternVersion=1):PatternTable {
  return {...Object.fromEntries(PATTERN_IDS.map((id,i)=>[id,{speed:i<6?25*(i%3+1):version>=3?100:25,durationMs:i<6?200:0}])),
    forward100:{speed:100,durationMs:1000},backward100:{speed:100,durationMs:1000},right90:{speed:100,durationMs:0},left90:{speed:100,durationMs:0}} as PatternTable;
}
export function validPattern(id:PatternId,p:PatternConfig,version:PatternVersion=1){
  if(fixedProgram(id))return p?.speed===100&&p.durationMs===1000;
  if(version>=3)return patternIds(version).includes(id)&&p?.speed===100
    &&Number.isInteger(p.durationMs)&&(p.durationMs===0||(p.durationMs>=50&&p.durationMs<=(turn90(id)?2000:500)));
  const i=patternIds(1).indexOf(id);
  return i>=0&&p&&[25,50,75].includes(p.speed)&&(i>=6||p.speed===25*(i%3+1))&&Number.isInteger(p.durationMs)&&(p.durationMs===0||(p.durationMs>=50&&p.durationMs<=500));
}
export function parsePatterns(value:unknown,expectedVersion?:PatternVersion):PatternTable {
  const v=value as {version?:number;slots?:number[][]};
  if((v?.version!==1&&v?.version!==2&&v?.version!==3&&v?.version!==4&&v?.version!==5)||(expectedVersion!==undefined&&v.version!==expectedVersion))throw new Error('パターン形式が違います。');
  const version=v.version;
  const ids=patternIds(version);
  if(!Array.isArray(v.slots)||v.slots.length!==ids.length)throw new Error('パターン形式が違います。');
  const out=defaultPatterns(version);
  ids.forEach((id,i)=>{
    const slot=v.slots![i];
    if(!Array.isArray(slot)||slot.length!==2)throw new Error('パターン値が不正です。');
    const [speed,durationMs]=slot,p={speed,durationMs} as PatternConfig;
    if(!validPattern(id,p,version))throw new Error('パターン値が不正です。');
    out[id]=p;
  });
  return out;
}
export function patternLabel(id:PatternId){return id.startsWith('forward')?`前進 ${id.slice(7)}%`:id.startsWith('backward')?`後進 ${id.slice(8)}%`:`${id.startsWith('right')?'右':'左'} ${id.replace(/\D/g,'')}°（時間校正）`;}
export function patternOutput(id:PatternId,speed:number,correctedTurns=false):[number,number] {
  if(id.startsWith('forward'))return [speed,speed];
  if(id.startsWith('backward'))return [-speed,-speed];
  const right=id.startsWith('right');
  return right!==correctedTurns?[speed,-speed]:[-speed,speed];
}
export function swapTurnPatterns(table:PatternTable):PatternTable {
  const swapped=structuredClone(table);
  for(const angle of [15,30,45] as const){
    swapped[`right${angle}`]=structuredClone(table[`left${angle}`]);
    swapped[`left${angle}`]=structuredClone(table[`right${angle}`]);
  }
  return swapped;
}
export const patternStorageKey=(version:PatternVersion)=>version>=4?`colon-motor-patterns-v${version}`:'colon-motor-patterns-v1';
export function adaptPatterns(value:Partial<PatternTable>|null,version:PatternVersion):PatternTable {
  const defaults=defaultPatterns(version);
  for(const id of Object.keys(defaults) as PatternId[])if(validPattern(id,value?.[id] as PatternConfig,version))defaults[id]=value![id]!;
  return defaults;
}
export function readLocalPatterns(version:PatternVersion=1):PatternTable {
  try{
    const saved=localStorage.getItem(patternStorageKey(version));
    if(version===5&&saved===null)return adaptPatterns(readLocalPatterns(4),5);
    if(version===4&&saved===null)return swapTurnPatterns(adaptPatterns(JSON.parse(localStorage.getItem('colon-motor-patterns-v1')??'null'),4));
    return adaptPatterns(JSON.parse(saved??'null'),version);
  }
  catch{return defaultPatterns(version);}
}
