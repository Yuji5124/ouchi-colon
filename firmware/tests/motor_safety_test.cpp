#include <iostream>
#include <cstring>
#include "../ColonAtomS3MotorTest/MotorSafety.h"
#include "../ColonAtomS3MotorTest/PhonePolicy.h"
using namespace colon;
static int checks=0;
#define CHECK(value) do { checks++; if(!(value)) { std::cerr<<"FAIL line "<<__LINE__<<": "<<#value<<"\n"; return 1; } } while(0)
static Command command(MotorSafety& m,Action action) { Command c; c.type=action; c.seq=m.lastSeq+1; return c; }
static const char* arm(MotorSafety& m,uint32_t now=0) { auto c=command(m,Action::Arm); c.checks=15; return m.command(c,now); }
static const char* drive(MotorSafety& m,int l,int r,uint32_t press=1,uint32_t now=0) {
  auto c=command(m,Action::Drive); c.left=l; c.right=r; c.press=press; return m.command(c,now);
}
static void setup(MotorSafety& m) { m.begin(true,0); m.connect(0); }
int main() {
  CHECK(phoneOriginAllowed("https://yuji5124.github.io","https://yuji5124.github.io"));
  CHECK(!phoneOriginAllowed("https://evil.example","https://yuji5124.github.io"));
  CHECK(!phoneOriginAllowed("","https://yuji5124.github.io"));
  CHECK(!phoneOriginAllowed("https://yuji5124.github.io.evil.example","https://yuji5124.github.io"));
  CHECK(phoneRouteAllowed("/phone/stop")); CHECK(!phoneRouteAllowed("/phone/stop?ignored=1")); CHECK(!phoneRouteAllowed("/phone/firmware"));
  CHECK(phoneKeyMatches("0123456789abcdef","0123456789abcdef"));
  CHECK(!phoneKeyMatches("1123456789abcdef","0123456789abcdef")); CHECK(!phoneKeyMatches("short","short"));
  { MotorSafety m; CHECK(!m.armed&&!m.active&&m.left==0&&m.right==0); m.begin(false,0); m.connect(0); CHECK(arm(m)!=nullptr); CHECK(m.left==0); }
  { int p[]={5,6,7,8},dup[]={5,6,5,8},lcd[]={5,6,7,16},imu[]={5,6,38,39}; CHECK(validPins(p)); CHECK(!validPins(dup)); CHECK(!validPins(lcd)); CHECK(!validPins(imu)); }
  { MotorSafety m; setup(m); auto c=command(m,Action::Arm); c.stage=3;c.checks=15; CHECK(m.command(c,0)!=nullptr); CHECK(!m.active&&!m.outputsEnabled); }
  { MotorSafety m(false,true,false); setup(m); auto c=command(m,Action::Arm);c.stage=3;c.checks=7; CHECK(m.command(c,0)!=nullptr);
    c.seq++;c.checks=15;CHECK(m.command(c,0)==nullptr); CHECK(m.armed);m.stop("stop",1);
    c.seq++;c.stage=5;c.checks=63;c.measuredMv=1500;CHECK(m.command(c,1)!=nullptr); CHECK(!m.armed); }
  { MotorSafety m(false,true,true); setup(m); auto c=command(m,Action::Arm);c.stage=5;c.checks=63;c.measuredMv=1500;CHECK(m.command(c,0)==nullptr);m.stop("stop",0);
    c.seq++;c.measuredMv=1501;CHECK(m.command(c,0)!=nullptr);CHECK(!m.armed); }
  { MotorSafety m(true); setup(m); CHECK(drive(m,1,0)!=nullptr);CHECK(!m.active);CHECK(arm(m)==nullptr);CHECK(drive(m,1,0)==nullptr);m.tick(10);CHECK(m.left==10&&m.right==0);
    m.stop("stop",20);CHECK(arm(m,20)==nullptr);CHECK(drive(m,0,-1,2,20)==nullptr);m.tick(30);CHECK(m.left==0&&m.right==-10); }
  { MotorSafety m(true);setup(m);auto c=command(m,Action::Config);c.settings.invertLeft=true;c.settings.rightPercent=40;CHECK(m.command(c,0)==nullptr);CHECK(arm(m)==nullptr);CHECK(drive(m,1,1)==nullptr);m.tick(20);CHECK(m.left==-20&&m.right==20); }
  { MotorSafety m(true);setup(m);auto c=command(m,Action::Config);c.settings.leftPercent=-1;CHECK(m.command(c,0)!=nullptr);c.seq++;c.settings.leftPercent=101;CHECK(m.command(c,0)!=nullptr);
    c.seq++;c.settings.leftPercent=20;c.settings.pwmHz=20001;CHECK(m.command(c,0)!=nullptr);c.seq++;c.settings.pwmHz=1000;c.settings.pulseMs=501;CHECK(m.command(c,0)!=nullptr);CHECK(!m.active); }
  { MotorSafety m(true);setup(m);auto cfg=command(m,Action::Config);cfg.settings.pulseMs=500;CHECK(m.command(cfg,0)==nullptr);CHECK(arm(m)==nullptr);CHECK(drive(m,1,1)==nullptr);
    for(uint32_t now=80;now<500;now+=80) { auto h=command(m,Action::Hold);h.press=1;CHECK(m.command(h,now)==nullptr); }
    m.tick(500);CHECK(!m.active&&!m.armed&&m.left==0&&m.right==0);CHECK(std::strcmp(m.stopReason,"pulse-limit")==0);
    auto hold=command(m,Action::Hold);hold.press=1;CHECK(m.command(hold,510)==nullptr);CHECK(!m.active); }
  { MotorSafety m(true);setup(m);auto cfg=command(m,Action::Config);cfg.settings.pulseMs=500;CHECK(m.command(cfg,0)==nullptr);CHECK(arm(m)==nullptr);CHECK(drive(m,1,0)==nullptr);
    auto h=command(m,Action::Heartbeat);CHECK(m.command(h,100)==nullptr);h.seq++;CHECK(m.command(h,200)==nullptr);m.tick(220);CHECK(!m.active);CHECK(std::strcmp(m.stopReason,"hold-timeout")==0); }
  { MotorSafety m(true);setup(m);CHECK(arm(m)==nullptr);m.tick(1000);CHECK(!m.connected&&!m.armed);m.connect(1010);CHECK(!m.armed);CHECK(drive(m,1,1,1,1010)!=nullptr); }
  { MotorSafety m(true);setup(m);CHECK(arm(m)==nullptr);auto old=command(m,Action::Drive);old.left=1;old.press=1;auto stop=old;stop.type=Action::Stop;stop.seq++;CHECK(m.command(stop,10)==nullptr);
    CHECK(m.command(old,20)!=nullptr);CHECK(!m.active&&!m.armed); }
  { MotorSafety m(true);setup(m);CHECK(arm(m)==nullptr);CHECK(drive(m,1,1)==nullptr);auto e=command(m,Action::Estop);CHECK(m.command(e,10)==nullptr);CHECK(m.estop&&!m.active);
    m.disconnect(11);m.connect(12);CHECK(m.estop);CHECK(arm(m,12)!=nullptr);auto r=command(m,Action::Reset);CHECK(m.command(r,13)==nullptr);CHECK(!m.estop&&!m.armed); }
  { MotorSafety m(true);setup(m);auto cfg=command(m,Action::Config);cfg.settings.pulseMs=500;cfg.settings.leftPercent=100;CHECK(m.command(cfg,0)==nullptr);CHECK(arm(m)==nullptr);CHECK(drive(m,1,0)==nullptr);m.tick(50);CHECK(m.left==50);
    m.stop("stop",50);CHECK(arm(m,60)==nullptr);CHECK(drive(m,-1,0,2,60)==nullptr);m.tick(140);CHECK(m.left==0);m.tick(150);CHECK(m.left==-10); }
  { MotorSafety m(true);uint32_t start=0xffffffd0U;m.begin(true,start);m.connect(start);CHECK(arm(m,start)==nullptr);CHECK(drive(m,1,1,1,start)==nullptr);m.tick(start+99);CHECK(m.active);m.tick(start+100);CHECK(!m.active); }
  { MotorSafety m(true);setup(m);CHECK(arm(m)==nullptr);CHECK(drive(m,1,1)==nullptr);auto c=command(m,Action::Config);CHECK(m.command(c,10)!=nullptr);CHECK(!m.active&&!m.armed); }
  for(int i=0;i<1000;i++) {
    MotorSafety m(true);setup(m);auto c=command(m,Action::Config);c.settings.leftPercent=i%101;c.settings.rightPercent=(i*7)%101;c.settings.pulseMs=500;c.settings.softStartMs=50+(i%951);CHECK(m.command(c,0)==nullptr);
    CHECK(arm(m)==nullptr);CHECK(drive(m,i%2?1:-1,i%3?1:0)==nullptr);m.tick(10);CHECK(abs(m.left)<=c.settings.leftPercent&&abs(m.right)<=c.settings.rightPercent);
    m.tick(220);CHECK(!m.active&&!m.armed&&m.left==0&&m.right==0);m.connect(300);CHECK(!m.active&&!m.armed);
  }
  std::cout<<"{\"suite\":\"MotorSafety native\",\"assertions\":"<<checks<<",\"randomized_cases\":1000,\"result\":\"PASS\",\"hardware\":\"not tested\"}\n";
  return 0;
}
