import {MOTOR_SERVICE,MOTOR_COMMAND,MOTOR_STATUS,MOTOR_PATTERNS,parseStatus,type MotorStatus} from './protocol.ts';
import {MockMotor} from './mock.ts';
import {parsePatterns,type PatternTable} from './patterns.ts';
export interface Transport {kind:'mock'|'ble';connect():Promise<void>;disconnect():void;read():Promise<MotorStatus>;write(frame:Uint8Array):Promise<void>;readPatterns():Promise<PatternTable>;onDisconnect:()=>void;}
export class MockTransport implements Transport {
  kind='mock' as const;core:MockMotor;constructor(singleTest=false,program=false){this.core=new MockMotor(singleTest,program);}onDisconnect=()=>{};private start=performance.now();private timer:ReturnType<typeof setInterval>|null=null;
  now(){return Math.floor(performance.now()-this.start);}
  async connect(){this.core.connect(this.now());this.timer=setInterval(()=>this.core.tick(this.now()),5);}
  disconnect(){if(this.timer)clearInterval(this.timer);this.timer=null;this.core.disconnect(this.now());this.onDisconnect();}
  async read(){return this.core.status(this.now());}
  async write(frame:Uint8Array){this.core.write(frame,this.now());}
  async readPatterns(){return structuredClone(this.core.patterns);}
  reboot(){this.core.reboot(this.now());}
}
// Local structural types: no dependency on experimental Web Bluetooth TS ambient declarations.
interface Characteristic {readValue():Promise<DataView>;writeValueWithResponse(value:Uint8Array):Promise<void>;}
interface Gatt {connected:boolean;connect():Promise<Gatt>;disconnect():void;getPrimaryService(uuid:string):Promise<{getCharacteristic(uuid:string):Promise<Characteristic>}>;}
interface Device {gatt?:Gatt;addEventListener(type:string,listener:()=>void):void;}
export class BleTransport implements Transport {
  kind='ble' as const;onDisconnect=()=>{};private device:Device|null=null;private command:Characteristic|null=null;private status:Characteristic|null=null;private patterns:Characteristic|null=null;
  private patternsVersion:1|2|3|4|undefined;
  async connect(){
    const bluetooth=(navigator as unknown as {bluetooth?:{requestDevice(options:unknown):Promise<Device>}}).bluetooth;
    if(!isSecureContext||!bluetooth)throw new Error('実機BLEはPCのChrome / Edge、Android Chromeなどで使用してください。iPhone Safariは非対応です。');
    const device=await bluetooth.requestDevice({filters:[{services:[MOTOR_SERVICE]}]});this.device=device;
    device.addEventListener('gattserverdisconnected',()=>{this.command=this.status=null;this.onDisconnect();});
    try {const server=await device.gatt?.connect();if(!server)throw new Error('BLE接続に失敗しました。');const service=await server.getPrimaryService(MOTOR_SERVICE);this.command=await service.getCharacteristic(MOTOR_COMMAND);this.status=await service.getCharacteristic(MOTOR_STATUS);this.patternsVersion=(await this.read()).patternsVersion;if(this.patternsVersion)this.patterns=await service.getCharacteristic(MOTOR_PATTERNS);}
    catch(error){this.disconnect();throw error;}
  }
  disconnect(){this.device?.gatt?.disconnect();this.command=this.status=this.patterns=null;}
  async read(){if(!this.status)throw new Error('BLE未接続');const data=await this.status.readValue();return parseStatus(JSON.parse(new TextDecoder().decode(data)));}
  async write(frame:Uint8Array){if(!this.command)throw new Error('BLE未接続');await this.command.writeValueWithResponse(frame);}
  async readPatterns(){if(!this.patterns)throw new Error('パターン対応ファームが必要です。');return parsePatterns(JSON.parse(new TextDecoder().decode(await this.patterns.readValue())),this.patternsVersion);}
}
