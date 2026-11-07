import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const single=process.argv.includes('--single');
const rc=process.argv.includes('--rc');
const program=process.argv.includes('--program');
const boot=process.argv.includes('--boot');
const bootDual=process.argv.includes('--boot-dual');
const bootTrial=boot||bootDual;
if([single,rc,boot,bootDual,program].filter(Boolean).length>1)throw new Error('試験ファームの種類は1つだけ選べます。');
const version=program?'1.5.1':bootDual?'1.4.2':boot?'1.4.0':rc?'1.3.0':single?'1.2.1':'1.1.1',core=process.env.PLATFORMIO_CORE_DIR;
if(!core)throw new Error('PLATFORMIO_CORE_DIRをビルドで使用したパスに設定してください。');
const build=join(process.env.PLATFORMIO_BUILD_DIR||'firmware/motor-test/.pio/build',program?'atoms3-program':bootDual?'atoms3-boot-dual-test':boot?'atoms3-boot-test':rc?'atoms3-rc-test':single?'atoms3-single-test':'atoms3-signal-test');
const parts=[['bootloader.bin',0,join(build,'bootloader.bin')],['partitions.bin',0x8000,join(build,'partitions.bin')],['boot_app0.bin',0xe000,join(core,'packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin')],['firmware.bin',0x10000,join(build,'firmware.bin')]];
const partition=await readFile(parts[1][2]);let nvs=null,app=null;
for(let p=0;p+32<=partition.length;p+=32){if(partition.readUInt16LE(p)!==0x50aa)break;const item={type:partition[p+2],subtype:partition[p+3],offset:partition.readUInt32LE(p+4),size:partition.readUInt32LE(p+8)};if(item.type===1&&item.subtype===2)nvs=item;if(item.type===0&&item.offset===0x10000)app=item;}
if(!nvs||!app||nvs.offset!==0x9000)throw new Error('検証済みパーティション配置ではありません。');
const base=program?'public/firmware/program':bootDual?'public/firmware/boot-dual':boot?'public/firmware/boot':rc?'public/firmware/rc':single?'public/firmware/experimental':'public/firmware';
const dir=`${base}/colon-motor-${version}`;await mkdir(dir,{recursive:true});const manifest={schema:'colon-firmware/1',version,chip:'ESP32-S3',flashBytes:8388608,poweredTests:program?'drive-program':bootDual?'boot-dual':boot?'boot-trial':rc?'rc-trial':single?'experimental-single':false,lcdDisplay:true,...(program?{powerQualified:false,maxVmV:3,maxPulseMs:1000,maxDuty:100}:bootTrial?{powerQualified:false,maxVmV:3,maxPulseMs:bootDual?2000:100,maxDuty:bootDual?100:50}:rc?{powerQualified:false,maxPulseMs:500,maxDuty:75}:single?{powerQualified:false,assumedV:1.5,maxPulseMs:100,maxDuty:75}:{}),parts:[]};
const firmware=await readFile(join(build,'firmware.bin'));
if(!firmware.includes(Buffer.from(`colon-motor-${version}`)))throw new Error('ファームの版が配布版と一致しません。ビルド先を確認してください。');
if(!firmware.includes(Buffer.from('COLON_POWER_LOCK=0'))||firmware.includes(Buffer.from('COLON_POWER_LOCK=1')))throw new Error('通常運転の電源適合フラグを0にしたビルドだけをUSB配布できます。');
if(single!==firmware.includes(Buffer.from('COLON_SINGLE_TEST=1')))throw new Error('単体試験ビルドの種別が一致しません。');
if((rc||program)!==firmware.includes(Buffer.from('COLON_RC_TEST=1'))||program!==firmware.includes(Buffer.from('COLON_PROGRAM=1')))throw new Error('走行用ビルドの種別が一致しません。');
if(bootTrial!==firmware.includes(Buffer.from('COLON_BOOT_TEST=1'))
  ||bootDual!==firmware.includes(Buffer.from('COLON_BOOT_DUAL_TEST=1')))throw new Error('起動試験ビルドの種別が一致しません。');
for(const [name,address,path] of parts){const bytes=await readFile(path);if((name==='bootloader.bin'||name==='firmware.bin')&&(bytes[0]!==0xe9||bytes.readUInt16LE(12)!==9))throw new Error('ESP32-S3のビルドではありません。');if(name==='firmware.bin'&&bytes.length>app.size)throw new Error('アプリ領域を超えています。');const start=Math.floor(address/4096)*4096,end=Math.ceil((address+bytes.length)/4096)*4096;if(start<nvs.offset+nvs.size&&end>nvs.offset)throw new Error('NVS消去の恐れがある配置です。');await writeFile(join(dir,name),bytes);manifest.parts.push({path:`colon-motor-${version}/${name}`,address,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),md5:createHash('md5').update(bytes).digest('hex')});}
await writeFile(`${base}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');console.log('Validated sparse AtomS3 firmware package:',manifest.parts.map(p=>`${p.path}@0x${p.address.toString(16)}`).join(', '));
