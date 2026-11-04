export const PATTERN_IDS=['forward25','forward50','forward75','backward25','backward50','backward75','right15','right30','right45','left15','left30','left45'] as const;
export type PatternId=typeof PATTERN_IDS[number];
export interface PatternConfig {speed:25|50|75;durationMs:number;}
export type PatternTable=Record<PatternId,PatternConfig>;
export function defaultPatterns():PatternTable {return Object.fromEntries(PATTERN_IDS.map((id,i)=>[id,{speed:i<6?25*(i%3+1):25,durationMs:i<6?200:0}])) as PatternTable;}
export function validPattern(id:PatternId,p:PatternConfig){const i=PATTERN_IDS.indexOf(id);return i>=0&&p&&[25,50,75].includes(p.speed)&&(i>=6||p.speed===25*(i%3+1))&&Number.isInteger(p.durationMs)&&(p.durationMs===0||(p.durationMs>=50&&p.durationMs<=500));}
export function parsePatterns(value:unknown):PatternTable {const v=value as {version?:number;slots?:number[][]};if(v?.version!==1||!Array.isArray(v.slots)||v.slots.length!==12)throw new Error('パターン形式が違います。');const out=defaultPatterns();PATTERN_IDS.forEach((id,i)=>{const [speed,durationMs]=v.slots![i]??[];const p={speed,durationMs} as PatternConfig;if(!validPattern(id,p))throw new Error('パターン値が不正です。');out[id]=p;});return out;}
export function patternLabel(id:PatternId){return id.startsWith('forward')?`前進 ${id.slice(7)}%`:id.startsWith('backward')?`後進 ${id.slice(8)}%`:`${id.startsWith('right')?'右':'左'} ${id.replace(/\D/g,'')}°（時間校正）`;}
export function patternOutput(id:PatternId,speed:number):[number,number] {return id.startsWith('forward')?[speed,speed]:id.startsWith('backward')?[-speed,-speed]:id.startsWith('right')?[speed,-speed]:[-speed,speed];}
export function readLocalPatterns():PatternTable {try{const value=JSON.parse(localStorage.getItem('colon-motor-patterns-v1')??'null');if(!value)return defaultPatterns();for(const id of PATTERN_IDS)if(!validPattern(id,value[id]))throw new Error();return value;}catch{return defaultPatterns();}}
