#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <algorithm>
namespace colon {
constexpr uint32_t HOLD_MS=220, LINK_MS=1000, REVERSE_MS=100;
struct Settings {
  int leftPercent=20, rightPercent=20, pwmHz=1000, softStartMs=100, pulseMs=100;
  bool invertLeft=false, invertRight=false;
};
inline bool validSettings(const Settings& s) {
  return s.leftPercent>=0 && s.leftPercent<=100 && s.rightPercent>=0 && s.rightPercent<=100
    && s.pwmHz>=500 && s.pwmHz<=20000 && s.softStartMs>=50 && s.softStartMs<=1000 && s.pulseMs>=50 && s.pulseMs<=500;
}
inline bool validPins(const int* p) {
  for(int i=0;i<4;i++) { if(p[i]<5||p[i]>8) return false; for(int j=0;j<i;j++) if(p[i]==p[j]) return false; }
  return true;
}
enum class Action { Arm,Disarm,Drive,Hold,Heartbeat,Stop,Estop,Reset,Config,Unknown };
struct Command {
  Action type=Action::Unknown; uint32_t seq=0,press=0; int left=0,right=0,stage=2,measuredMv=0; unsigned checks=0; Settings settings;
};
// checks: wiring=1, physical switch=2, raised=4, VM off=8, voltage measured=16, current reviewed=32.
class MotorSafety {
public:
  Settings settings;
  bool connected=false,armed=false,estop=false,active=false,gpioReady=false;
  const bool simulation,outputsEnabled,powerQualified;
  int stage=2,left=0,right=0,targetLeft=0,targetRight=0;
  uint32_t lastSeq=0,lastHeartbeatMs=0;
  const char* stopReason="boot";
  MotorSafety(bool simulated=false,bool outputs=false,bool qualified=false): simulation(simulated),outputsEnabled(outputs),powerQualified(qualified) {}
  void begin(bool ready,uint32_t now) { gpioReady=ready; stop("boot",now); }
  void connect(uint32_t now) { stop("connected-disarmed",now); connected=true; lastSeq=lastPress=0; lastHeartbeatMs=now; }
  void stop(const char* reason,uint32_t now) {
    if(active) stoppedAt=now;
    armed=active=false; left=right=targetLeft=targetRight=0; stopReason=reason;
  }
  void disconnect(uint32_t now) { stop("disconnected",now); connected=false; }
  const char* command(const Command& c,uint32_t now) {
    tick(now);
    if(!connected) return "not-connected";
    if(c.seq==0||c.seq>2147483647UL) { stop("invalid-sequence",now); return "invalid-sequence"; }
    if(c.type==Action::Stop||c.type==Action::Disarm||c.type==Action::Estop) {
      lastSeq=std::max(lastSeq,c.seq); if(c.type==Action::Estop) estop=true;
      stop(c.type==Action::Estop?"estop":c.type==Action::Disarm?"disarm":"stop",now); return nullptr;
    }
    if(c.seq<=lastSeq) return "stale-sequence";
    lastSeq=c.seq;
    switch(c.type) {
      case Action::Heartbeat: lastHeartbeatMs=now; break;
      case Action::Reset: stop("reset-disarmed",now); estop=false; break;
      case Action::Config:
        if(armed||active) { stop("config-while-armed",now); return "config-while-armed"; }
        if(!validSettings(c.settings)) { stop("invalid-settings",now); return "invalid-settings"; }
        settings=c.settings; break;
      case Action::Arm:
        if(!gpioReady||estop||(c.checks&7)!=7||c.stage<2||c.stage>7
          ||(!simulation&&(!outputsEnabled||c.stage==2))
          ||(c.stage<=4&&!(c.checks&8))
          ||(c.stage>=5&&((!simulation&&!powerQualified)||(c.checks&48)!=48||c.measuredMv<=0||c.measuredMv>1500))) {
          stop("arm-denied",now); return "arm-denied";
        }
        stage=c.stage; armed=true; stopReason="armed"; lastHeartbeatMs=now; break;
      case Action::Drive: {
        if(!armed||estop||c.left < -1||c.left>1||c.right < -1||c.right>1||c.press==0||c.press<=lastPress) {
          stop("drive-denied",now); return "drive-denied";
        }
        if(active) { stop("release-before-next-drive",now); return "release-before-next-drive"; }
        int l=c.left*settings.leftPercent*(settings.invertLeft?-1:1), r=c.right*settings.rightPercent*(settings.invertRight?-1:1);
        bool reversing=(l&&lastLeftDirection&&sign(l)!=lastLeftDirection)||(r&&lastRightDirection&&sign(r)!=lastRightDirection);
        pauseMs=reversing&&uint32_t(now-stoppedAt)<REVERSE_MS?REVERSE_MS-uint32_t(now-stoppedAt):0;
        press=lastPress=c.press; targetLeft=l; targetRight=r; start=hold=lastTick=now; active=bool(l||r);
        if(!active) stop("zero-speed",now);
        break;
      }
      case Action::Hold:
        if(c.press!=press) return "invalid-hold";
        if(active) hold=now;
        lastHeartbeatMs=now; break;
      default: stop("invalid-command",now); return "invalid-command";
    }
    return nullptr;
  }
  void tick(uint32_t now) {
    if(connected&&uint32_t(now-lastHeartbeatMs)>=LINK_MS) { disconnect(now); stopReason="link-timeout"; return; }
    if(!active) return;
    if(uint32_t(now-start)>=uint32_t(settings.pulseMs)) { stop("pulse-limit",now); return; }
    if(uint32_t(now-hold)>=HOLD_MS) { stop("hold-timeout",now); return; }
    if(uint32_t(now-start)<pauseMs) { lastTick=now; return; }
    uint32_t dt=now-lastTick; if(!dt) return;
    int step=std::max(1,int(dt*100/uint32_t(settings.softStartMs))); lastTick=now;
    left=sign(targetLeft)*std::min(abs(targetLeft),abs(left)+step);
    right=sign(targetRight)*std::min(abs(targetRight),abs(right)+step);
    if(left) lastLeftDirection=sign(left);
    if(right) lastRightDirection=sign(right);
  }
private:
  uint32_t start=0,hold=0,lastTick=0,pauseMs=0,press=0,lastPress=0,stoppedAt=0;
  int lastLeftDirection=0,lastRightDirection=0;
  static int sign(int v) { return (v>0)-(v<0); }
};
}
