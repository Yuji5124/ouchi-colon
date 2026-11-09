export type PadMotion='forward'|'backward'|'left'|'right';
export interface PadSnapshot {id:string;index:number;connected:boolean;mapping:string;buttons:ReadonlyArray<{pressed:boolean;value:number}>;axes:readonly number[];}
export type PadMapping=Record<PadMotion,string>;
export const PAD_DIRECTIONS:PadMotion[]=['forward','backward','left','right'];
export function defaultPadMapping(standard:boolean):PadMapping{return standard?{forward:'b12',backward:'b13',left:'b14',right:'b15'}:{forward:'a1-',backward:'a1+',left:'a0-',right:'a0+'};}
export function padInputs(pad:PadSnapshot):string[]{
  const inputs:string[]=[];
  pad.buttons.forEach((b,i)=>{if(b.pressed||b.value>0.5)inputs.push('b'+i);});
  pad.axes.forEach((a,i)=>{if(Number.isFinite(a)&&Math.abs(a)>0.6)inputs.push('a'+i+(a<0?'-':'+'));});return inputs;
}
export function validPadMapping(value:unknown):value is PadMapping{
  if(!value||typeof value!=='object')return false;
  const values=PAD_DIRECTIONS.map(d=>(value as PadMapping)[d]);
  return values.every(v=>typeof v==='string'&&/^(?:b\d{1,2}|a\d{1,2}[+-])$/.test(v))&&new Set(values).size===4;
}
/** One press, one bounded command. Reconnection, stops and conflicts require neutral. */
export class PadGate {
  private neutralRequired=true;
  private active:PadMotion|null=null;
  reset(){this.neutralRequired=true;this.active=null;}
  sample(inputs:string[],mapping:PadMapping,available:boolean):{start?:PadMotion;stop?:boolean}{
    if(!available||!validPadMapping(mapping)){const stop=this.active!==null;this.reset();return {stop};}
    if(!inputs.length){const stop=this.active!==null;this.active=null;this.neutralRequired=false;return {stop};}
    const directions=PAD_DIRECTIONS.filter(d=>inputs.includes(mapping[d]));
    const otherButton=inputs.some(i=>i.startsWith('b')&&!Object.values(mapping).includes(i));
    // Some devices expose the same D-pad through both axes and buttons.
    if(otherButton||directions.length!==1){const stop=true;this.reset();return {stop};}
    if(this.neutralRequired)return {};
    if(this.active&&this.active!==directions[0]){this.reset();return {stop:true};}
    if(this.active)return {};
    this.active=directions[0];return {start:this.active};
  }
}
