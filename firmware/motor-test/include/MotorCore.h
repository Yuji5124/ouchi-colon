#pragma once
#include <stdint.h>
#include <stddef.h>
#include "Patterns.h"

namespace colon {
constexpr uint32_t HEARTBEAT_TIMEOUT_MS = 350;
constexpr uint32_t PROGRAM_HEARTBEAT_TIMEOUT_MS = 1000;
constexpr uint32_t MAX_PULSE_MS = 500;
constexpr uint32_t REVERSAL_DWELL_MS = 100;
constexpr uint8_t PROTOCOL = 1;
constexpr uint8_t RC_ARM = 3;
constexpr uint8_t DIRECT_MODE = 4;
constexpr uint8_t ACTION_MODE = 5;
constexpr uint32_t MAX_ACTION_MS = 12000;
constexpr int RC_MAX_DUTY = 75;
enum Op : uint8_t { ARM=1, DISARM=2, MOVE=3, STOP=4, HEARTBEAT=5, CONFIG=6, ESTOP=7, RESET_ESTOP=8, PATTERN=9, SAVE_PATTERN=10 };
struct Frame { uint8_t data[20]; };
inline uint32_t u32(const uint8_t* p) {return uint32_t(p[0]) | uint32_t(p[1])<<8 | uint32_t(p[2])<<16 | uint32_t(p[3])<<24;}
inline uint16_t u16(const uint8_t* p) {return uint16_t(p[0]) | uint16_t(p[1])<<8;}
constexpr bool validPins(int a,int b,int c,int d) {
  return a>=5&&a<=8&&b>=5&&b<=8&&c>=5&&c<=8&&d>=5&&d<=8&&a!=b&&a!=c&&a!=d&&b!=c&&b!=d&&c!=d;
}
struct MotorCore {
  bool ready=false, connected=false, armed=false, estop=false, signalOnly=false;
  bool powerQualified=false, invertLeft=false, invertRight=false;
  bool singleTest=false, rcTest=false, program=false, experimentalActive=false;
  uint32_t nonce=1, seq=0, heartbeatAt=0, startedAt=0, stoppedAt=0, rampAt=0;
  uint32_t moveSeq=0;
  uint16_t pulseMs=200, frequency=1000, activePulseMs=0;
  int targetLeft=0,targetRight=0,left=0,right=0;
  const char* reason="boot";
  PatternConfig patterns[PATTERN_COUNT];
  explicit MotorCore(bool qualified=false,bool single=false,bool rc=false,bool programmed=false)
    : powerQualified(qualified&&!single&&!rc),singleTest(single),rcTest(rc),program(programmed) {
    for(uint8_t i=0;i<patternCount();i++)patterns[i]=defaultPattern(i,program);
  }
  uint8_t patternCount() const {return program?PROGRAM_COUNT:PATTERN_COUNT;}
  uint32_t heartbeatTimeout() const {return program?PROGRAM_HEARTBEAT_TIMEOUT_MS:HEARTBEAT_TIMEOUT_MS;}
  static uint32_t elapsed(uint32_t now,uint32_t then) {return now-then;}
  void rotate() {if(++nonce==0)nonce=1; seq=0;}
  void stop(const char* why,uint32_t now) {
    left=right=targetLeft=targetRight=0;activePulseMs=0;armed=false;experimentalActive=false;reason=why;stoppedAt=now;rotate();
  }
  void connect(uint32_t seed,uint32_t now) {moveSeq=0;nonce=seed?seed:1;connected=true;stop("connected-disarmed",now);}
  void disconnect(uint32_t now) {connected=false;stop("disconnect",now);}
  bool reject(const char* why,uint32_t now) {stop(why,now);return false;}
  bool configure(const uint8_t* p,uint32_t now,uint32_t maximum=MAX_PULSE_MS){
    if(armed||left||right)return reject("config-while-armed",now);
    const uint16_t hz=u16(p+12),pulse=u16(p+17);
    if(hz<100||hz>20000||pulse<50||pulse>maximum||(p[14]&~3))return reject("invalid-config",now);
    if(singleTest&&(hz!=1000||pulse>100))return reject("single-config-limit",now);
    if(rcTest&&hz!=1000)return reject("rc-frequency",now);
    frequency=hz;pulseMs=pulse;invertLeft=(p[14]&1)!=0;invertRight=(p[14]&2)!=0;return true;
  }
  bool command(const Frame& frame,uint32_t now) {
    const uint8_t* p=frame.data;
    // Stop requests are fail-safe even when the client's nonce is obsolete.
    if(p[0]!=PROTOCOL)return reject("protocol-error",now);
    if(p[1]==STOP||p[1]==DISARM){stop(p[1]==STOP?"operator-stop":"disarm",now);return true;}
    if(p[1]==ESTOP){estop=true;stop("emergency",now);return true;}
    if(!connected||!ready)return reject("not-ready",now);
    if(u32(p+2)!=nonce||u32(p+6)<=seq)return false; // stale/replayed requests never extend a lease
    seq=u32(p+6);
    if(p[1]==RESET_ESTOP){estop=false;stop("emergency-reset-disarmed",now);return true;}
    if(p[1]==HEARTBEAT){heartbeatAt=now;return true;}
    if(estop)return reject("emergency-latched",now);
    if(p[1]==SAVE_PATTERN){
      PatternConfig config{p[11],u16(p+17)};
      if(armed||left||right)return reject("save-while-armed",now);
      if(!validPattern(p[10],config,program))return reject("invalid-pattern-config",now);
      patterns[p[10]]=config;if(program&&p[10]>=2)patterns[pairedTurn(p[10])]=config;return true;
    }
    if(p[1]==CONFIG)return configure(p,now);
    if(p[1]==ARM){
      if(p[15]!=15||p[16]>RC_ARM)return reject("safety-unconfirmed",now);
      if(armed)return reject("already-armed",now);
      if(singleTest&&p[16]!=2)return reject("single-mode-required",now);
      if(p[16]==2&&(!singleTest||pulseMs>100||frequency!=1000))return reject("single-mode-unavailable",now);
      if(p[16]==RC_ARM&&(!rcTest||frequency!=1000))return reject("rc-mode-unavailable",now);
      signalOnly=p[16]==1;
      experimentalActive=p[16]==2;
      if(!powerQualified&&!signalOnly&&!experimentalActive&&p[16]!=RC_ARM)return reject("power-unqualified",now);
      if(elapsed(now,stoppedAt)<REVERSAL_DWELL_MS)return reject("stop-dwell",now);
      armed=true;heartbeatAt=now;reason="armed";return true;
    }
    if(p[1]!=MOVE&&p[1]!=PATTERN)return reject("unknown-command",now);
    // One explicit motion carries its configuration. No hardware-check flags are asserted.
    if(p[16]==DIRECT_MODE||p[16]==ACTION_MODE){
      if(!program||p[15]!=0)return reject("direct-mode-unavailable",now);
      if(!configure(p,now,p[16]==ACTION_MODE?MAX_ACTION_MS:MAX_PULSE_MS))return false;
      signalOnly=false;armed=true;heartbeatAt=now;
    }
    int l=int(int8_t(p[10])),r=int(int8_t(p[11]));
    uint16_t duration=pulseMs;
    if(p[1]==PATTERN){
      if(singleTest)return reject("single-pattern-disabled",now);
      if(rcTest&&!program&&!signalOnly)return reject("rc-pattern-disabled",now);
      if(p[10]>=patternCount())return reject("unknown-pattern",now);
      const auto config=patterns[p[10]];
      if(!validPattern(p[10],config,program)||config.durationMs==0)return reject("pattern-uncalibrated",now);
      patternOutputs(p[10],config.speed,l,r,program);
      duration=config.durationMs;
    }
    if(l < -100||l>100||r < -100||r>100)return reject("invalid-pwm",now);
    if(program&&((l!=0&&l!=100&&l!=-100)||(r!=0&&r!=100&&r!=-100)))return reject("program-duty-fixed",now);
    if(singleTest&&(!experimentalActive||(l!=0&&r!=0)||(l==0&&r==0)||l < -75||l>75||r < -75||r>75))return reject("single-motor-limit",now);
    if(rcTest&&!signalOnly&&((!program&&(l < -RC_MAX_DUTY||l > RC_MAX_DUTY||r < -RC_MAX_DUTY||r > RC_MAX_DUTY))||(!l&&!r)))return reject("rc-duty-limit",now);
    if(!armed)return reject("disarmed",now);
    if(elapsed(now,heartbeatAt)>=heartbeatTimeout())return reject("heartbeat-timeout",now);
    // A press is a single bounded pulse, never an extendable motion lease.
    if(targetLeft||targetRight||left||right)return reject("stop-before-new-motion",now);
    if(elapsed(now,stoppedAt)<REVERSAL_DWELL_MS)return reject("stop-dwell",now);
    moveSeq=seq;targetLeft=l;targetRight=r;activePulseMs=duration;startedAt=now;rampAt=now;reason="running";
    if(program){left=l;right=r;}
    return true;
  }
  void tick(uint32_t now) {
    if(!armed)return;
    if(!connected){disconnect(now);return;}
    if(elapsed(now,heartbeatAt)>=heartbeatTimeout()){stop("heartbeat-timeout",now);return;}
    const uint32_t limit=singleTest&&activePulseMs>100?100:activePulseMs;
    if((targetLeft||targetRight||left||right)&&elapsed(now,startedAt)>=limit){stop("pulse-limit",now);return;}
    const uint32_t dt=elapsed(now,rampAt);if(dt<10)return;rampAt=now;
    const int step=int(dt>100?100:dt); // 1000 percentage points / second
    left=approach(left,targetLeft,step);right=approach(right,targetRight,step);
  }
  static int approach(int value,int target,int step){return value<target?(value+step>target?target:value+step):(value-step<target?target:value-step);}
  int physicalLeft() const {return invertLeft?-left:left;}
  int physicalRight() const {return invertRight?-right:right;}
};
}
