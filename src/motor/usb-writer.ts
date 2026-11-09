export interface FirmwarePart {path:string;address:number;size:number;sha256:string;md5:string;}
export interface FirmwareManifest {schema:'colon-firmware/1';version:string;chip:'ESP32-S3';flashBytes:8388608;poweredTests:false|'experimental-single'|'rc-trial'|'boot-trial'|'boot-dual'|'drive-program';lcdDisplay?:boolean;powerQualified?:false;assumedV?:1.5;maxPulseMs?:100|500|1000|2000|12000;maxDuty?:50|75|100;maxVmV?:3;parts:FirmwarePart[];}
export function validateManifest(value:unknown):FirmwareManifest {
  const m=value as FirmwareManifest;
  const versionMatches=(m?.poweredTests==='boot-trial'&&m.version==='1.4.0'&&m.maxPulseMs===100&&m.maxDuty===50)
    ||(m?.poweredTests==='boot-dual'&&m.version==='1.4.2'&&m.maxPulseMs===2000&&m.maxDuty===100)
    ||(m?.poweredTests==='drive-program'&&((m.version==='1.7.0'&&m.maxPulseMs===2000)||(['1.8.0','1.9.0'].includes(m.version)&&m.maxPulseMs===12000))&&m.maxDuty===100);
  const limitedValid=versionMatches&&m.powerQualified===false&&m.lcdDisplay===true
    &&m.assumedV===undefined&&m.maxVmV===3;
  if(!m||m.schema!=='colon-firmware/1'||m.chip!=='ESP32-S3'||m.flashBytes!==8388608||!((m.poweredTests===false&&/^1\.1\.\d+$/.test(m.version))||(m.poweredTests==='experimental-single'&&/^1\.2\.\d+$/.test(m.version)&&m.powerQualified===false&&m.assumedV===1.5&&m.maxPulseMs===100&&m.maxDuty===75)||(m.poweredTests==='rc-trial'&&m.version==='1.3.0'&&m.powerQualified===false&&m.lcdDisplay===true&&m.assumedV===undefined&&m.maxPulseMs===500&&m.maxDuty===75)||limitedValid)||!Array.isArray(m.parts)||m.parts.length!==4)throw new Error('対応する試験ファームではありません。');
  const expected=[0,0x8000,0xe000,0x10000];
  m.parts.forEach((p,i)=>{if(p.address!==expected[i]||!Number.isInteger(p.size)||p.size<=0||!/^colon-motor-[\d.]+\/[a-z0-9_-]+\.bin$/.test(p.path)||!/^([a-f0-9]){64}$/i.test(p.sha256)||!/^([a-f0-9]){32}$/i.test(p.md5))throw new Error('ファームウェア一覧が不正です。');const end=p.address+Math.ceil(p.size/4096)*4096;if(end>8388608||(i<3&&end>expected[i+1])||(p.address<0xe000&&end>0x9000))throw new Error('書込み範囲が重複しています。');});return m;
}
export async function sha256(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function fetchFirmware(base:string){
  const r=await fetch(`${base}manifest.json`,{cache:'no-store'});if(!r.ok)throw new Error('ファームウェアが未準備です。ビルドとパッケージ作成を完了してください。');
  const manifest=validateManifest(await r.json());const parts=[];
  for(const p of manifest.parts){const result=await fetch(`${base}${p.path}`,{cache:'no-store'});if(!result.ok)throw new Error('ファームウェアを取得できません。');const data=new Uint8Array(await result.arrayBuffer());if(data.length!==p.size||await sha256(data)!==p.sha256)throw new Error('ファームウェアのSHA-256が一致しません。書込みを中止しました。');parts.push({...p,data});}
  return {manifest,parts};
}
export type FirmwareBundle=Awaited<ReturnType<typeof fetchFirmware>>;
export interface LoaderPort {main():Promise<string>;readFlashId():Promise<number>;writeFlash(options:unknown):Promise<void>;flashMd5sum(address:number,size:number):Promise<string>;readFlash(address:number,size:number,progress?:unknown):Promise<Uint8Array>;after(mode:string):Promise<void>;}
export async function verifyChip(loader:Pick<LoaderPort,'main'|'readFlashId'>){const chip=await loader.main();if(!/^ESP32-S3\b/i.test(chip))throw new Error(`対象外のチップです：${chip}。AtomS3（C123）を確認してください。`);const flash=await loader.readFlashId();const exponent=(flash>>>16)&255;if(exponent<23||exponent>27)throw new Error('8MB以上のフラッシュ容量を確認できません。');return chip;}
export async function writeBundle(loader:Pick<LoaderPort,'writeFlash'|'flashMd5sum'|'after'>,bundle:FirmwareBundle,progress:(percent:number)=>void){
  // Sparse images preserve the NVS gap. No full-chip erase and no auto reboot.
  await loader.writeFlash({fileArray:bundle.parts.map(p=>({address:p.address,data:p.data})),flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:false,compress:true,reportProgress:(file:number,written:number,total:number)=>progress(Math.min(99,Math.round((file+written/total)/bundle.parts.length*100)))});
  for(const p of bundle.parts){const actual=(await loader.flashMd5sum(p.address,p.size)).toLowerCase();if(actual!==p.md5.toLowerCase())throw new Error('実機フラッシュのMD5照合が一致しません。再起動せずに書込み状態を確認してください。');}
  progress(100);
}
