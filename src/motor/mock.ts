import {OPS,parseStatus,type MotorStatus} from './protocol.ts';
import {patternIds,fixedProgram,defaultPatterns,validPattern,patternOutput,type PatternConfig} from './patterns.ts';
/** Reference simulation. No physical connection or GPIO access. Native C++ core is tested separately. */
export class MockMotor {
  state:MotorStatus={protocol:1,firmware:'colon-motor-1.1.0-mock',patternsVersion:1,bootId:1,bootCount:1,uptimeMs:0,resetReason:'mock-start',nonce:100,seq:0,connected:false,gpioReady:true,armed:false,estop:false,powerQualified:false,signalOnly:true,left:0,right:0,physicalLeft:0,physicalRight:0,stopReason:'boot',heartbeatAgeMs:0,pulseMs:200,frequency:1000};
  patterns=defaultPatterns();
  private experimentalActive=false;
  constructor(singleTest=false,program=false){
    this.state.singleTest=singleTest;
    if(singleTest)this.state.firmware='colon-motor-1.2.0-single-mock';
    else if(program){Object.assign(this.state,{firmware:'colon-motor-1.5.1',patternsVersion:3});this.patterns=defaultPatterns(3);}
  }
  private activePulseMs=0;
  private heartbeatAt=0;private startedAt=0;private stoppedAt=0;private rampAt=0;private target:[number,number]=[0,0];private invert=[false,false];
  stop(reason:string,now:number){Object.assign(this.state,{left:0,right:0,physicalLeft:0,physicalRight:0,armed:false,stopReason:reason,nonce:(this.state.nonce+1)>>>0||1,seq:0});this.target=[0,0];this.activePulseMs=0;this.experimentalActive=false;this.stoppedAt=now;}
  connect(now:number){this.state.connected=true;this.stop('connected-disarmed',now);}
  disconnect(now:number){this.state.connected=false;this.stop('disconnect',now);}
  reboot(now:number){this.state.bootId++;this.state.bootCount=(this.state.bootCount??0)+1;this.state.resetReason='mock-restart';this.state.estop=false;this.stop('boot',now);}
  write(bytes:Uint8Array,now:number){
    if(bytes.length!==20||bytes[0]!==1){this.stop('protocol-error',now);return;}
    const s=this.state,v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),op=bytes[1];
    if(op===OPS.STOP||op===OPS.DISARM){this.stop(op===OPS.STOP?'operator-stop':'disarm',now);return;}
    if(op===OPS.ESTOP){s.estop=true;this.stop('emergency',now);return;}
    if(!s.connected||!s.gpioReady){this.stop('not-ready',now);return;}
    if(v.getUint32(2,true)!==s.nonce||v.getUint32(6,true)<=s.seq)return;
    s.seq=v.getUint32(6,true);
    if(op===OPS.RESET_ESTOP){s.estop=false;this.stop('emergency-reset-disarmed',now);return;}
    if(op===OPS.HEARTBEAT){this.heartbeatAt=now;return;}
    if(s.estop){this.stop('emergency-latched',now);return;}
    if(op===OPS.SAVE_PATTERN){const id=patternIds(s.patternsVersion)[bytes[10]],config={speed:bytes[11],durationMs:v.getUint16(17,true)} as PatternConfig;if(s.armed){this.stop('save-while-armed',now);return;}if(!id||!validPattern(id,config,s.patternsVersion)){this.stop('invalid-pattern-config',now);return;}this.patterns[id]=config;return;}
    if(op===OPS.CONFIG){const f=v.getUint16(12,true),p=v.getUint16(17,true);if(s.armed||f<100||f>20000||p<50||p>500||(bytes[14]&~3)){this.stop('invalid-config',now);return;}if(s.singleTest&&(f!==1000||p>100)){this.stop("single-config-limit",now);return;}s.frequency=f;s.pulseMs=p;this.invert=[!!(bytes[14]&1),!!(bytes[14]&2)];return;}
    if(op===OPS.ARM){if(bytes[15]!==15||bytes[16]>2){this.stop('safety-unconfirmed',now);return;}if(s.singleTest&&bytes[16]!==2){this.stop("single-mode-required",now);return;}if(bytes[16]===2&&(!s.singleTest||s.pulseMs>100||s.frequency!==1000)){this.stop("single-mode-unavailable",now);return;}s.signalOnly=bytes[16]===1;this.experimentalActive=bytes[16]===2;if(!s.powerQualified&&!s.signalOnly&&!this.experimentalActive){this.stop('power-unqualified',now);return;}if(now-this.stoppedAt<100){this.stop('stop-dwell',now);return;}s.armed=true;this.heartbeatAt=now;s.stopReason='armed';return;}
    if(op!==OPS.MOVE&&op!==OPS.PATTERN){this.stop('unknown-command',now);return;}
    let l=v.getInt8(10),r=v.getInt8(11);
    let duration=s.pulseMs,fullStraight=false;
    if(op===OPS.PATTERN){if(s.singleTest){this.stop("single-pattern-disabled",now);return;}const id=patternIds(s.patternsVersion)[bytes[10]];if(!id){this.stop('unknown-pattern',now);return;}const config=this.patterns[id];if(!config.durationMs){this.stop('pattern-uncalibrated',now);return;}[l,r]=patternOutput(id,config.speed);duration=config.durationMs;fullStraight=fixedProgram(id);}
    if(Math.abs(l)>100||Math.abs(r)>100){this.stop('invalid-pwm',now);return;}
    if(s.patternsVersion===3&&[l,r].some(v=>v!==0&&Math.abs(v)!==100)){this.stop('program-duty-fixed',now);return;}
    if(s.singleTest&&(!this.experimentalActive||(l!==0&&r!==0)||(l===0&&r===0)||Math.abs(l)>75||Math.abs(r)>75)){this.stop('single-motor-limit',now);return;}
    if(!s.armed){this.stop('disarmed',now);return;}
    if(now-this.heartbeatAt>=350){this.stop('heartbeat-timeout',now);return;}
    if(this.target.some(Boolean)||s.left||s.right){this.stop('stop-before-new-motion',now);return;}
    if(now-this.stoppedAt<100){this.stop('stop-dwell',now);return;}
    this.target=[l,r];this.activePulseMs=duration;this.startedAt=this.rampAt=now;s.stopReason='running';
    if(fullStraight||s.patternsVersion===3)this.setOutput(l,r);
  }
  private setOutput(left:number,right:number){
    Object.assign(this.state,{left,right,physicalLeft:this.invert[0]?-left:left,physicalRight:this.invert[1]?-right:right});
  }
  tick(now:number){const s=this.state;s.uptimeMs=now;s.heartbeatAgeMs=now-this.heartbeatAt;if(!s.armed)return;if(!s.connected){this.disconnect(now);return;}if(now-this.heartbeatAt>=350){this.stop('heartbeat-timeout',now);return;}if(this.target.some(Boolean)&&now-this.startedAt>=this.activePulseMs){this.stop('pulse-limit',now);return;}const dt=now-this.rampAt;if(dt<10)return;this.rampAt=now;const approach=(a:number,b:number)=>a<b?Math.min(b,a+Math.min(dt,100)):Math.max(b,a-Math.min(dt,100));this.setOutput(approach(s.left,this.target[0]),approach(s.right,this.target[1]));}
  status(now:number){this.tick(now);return parseStatus({...this.state,pulseMs:this.activePulseMs||this.state.pulseMs});}
}
