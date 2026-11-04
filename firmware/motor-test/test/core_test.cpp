#include "MotorCore.h"
#include <cassert>
#include <iostream>
using namespace colon;
Frame frame(MotorCore& c,Op op,int l=0,int r=0){Frame f{};f.data[0]=1;f.data[1]=op;uint32_t n=c.nonce,s=c.seq+1;for(int i=0;i<4;i++){f.data[2+i]=(n>>(8*i))&255;f.data[6+i]=(s>>(8*i))&255;}f.data[10]=uint8_t(l);f.data[11]=uint8_t(r);f.data[15]=15;return f;}
void arm(MotorCore& c,uint32_t now,bool signal=false){auto f=frame(c,ARM);f.data[16]=signal;assert(c.command(f,now));}
void armSingle(MotorCore& c,uint32_t now=100){auto config=frame(c,CONFIG);config.data[12]=0xe8;config.data[13]=3;config.data[17]=100;assert(c.command(config,now));auto a=frame(c,ARM);a.data[16]=2;assert(c.command(a,now));assert(!c.powerQualified);}
int main(){
  int cases=0;
  {MotorCore c;assert(!c.armed&&c.left==0&&c.right==0&&!c.ready);assert(!c.command(frame(c,MOVE,50,0),100));cases++;}
  {MotorCore c;c.ready=true;c.connect(10,0);assert(!c.command(frame(c,ARM),100));assert(!c.armed);arm(c,200,true);assert(c.signalOnly);cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);assert(c.command(frame(c,MOVE,40,0),101));c.tick(121);assert(c.left>0&&c.right==0);c.stop("test",130);arm(c,230);assert(c.command(frame(c,MOVE,0,-50),231));c.tick(251);assert(c.left==0&&c.right<0);cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);c.command(frame(c,MOVE,50,0),101);c.tick(151);assert(!c.command(frame(c,MOVE,-50,0),152));assert(!c.armed&&c.left==0);assert(!c.command(frame(c,ARM),200));cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);c.command(frame(c,MOVE,50,50),101);c.command(frame(c,HEARTBEAT),200);c.tick(301);assert(!c.armed&&c.left==0&&c.right==0);assert(std::string(c.reason)=="pulse-limit");cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);c.tick(451);assert(!c.armed&&std::string(c.reason)=="heartbeat-timeout");cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);auto stale=frame(c,MOVE,50,50);c.disconnect(101);c.connect(2,102);assert(!c.armed&&!c.command(stale,202));c.tick(300);assert(c.left==0);cases++;}
  {assert(validPins(5,6,7,8));assert(!validPins(5,5,7,8));assert(!validPins(5,6,17,8));cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);assert(!c.command(frame(c,MOVE,101,0),101));assert(c.left==0);cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);auto f=frame(c,CONFIG);f.data[12]=0xe8;f.data[13]=3;f.data[14]=1;f.data[17]=200;assert(c.command(f,100));arm(c,100);c.command(frame(c,MOVE,50,0),101);c.tick(121);assert(c.physicalLeft()<0&&c.physicalRight()==0);cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);c.command(frame(c,ESTOP),101);assert(c.estop&&!c.armed);assert(!c.command(frame(c,ARM),250));assert(c.command(frame(c,RESET_ESTOP),300));assert(!c.armed&&!c.estop);cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);arm(c,100);auto stale=frame(c,MOVE,20,20);c.command(frame(c,STOP),101);assert(!c.command(stale,201));assert(!c.armed);cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0xffffff00u);arm(c,0xffffff80u);c.command(frame(c,MOVE,20,20),0xffffff81u);c.tick(0x49u);assert(!c.armed&&c.left==0);cases++;}
  {MotorCore c(true);c.ready=true;c.connect(1,0);auto f=frame(c,CONFIG);f.data[12]=1;f.data[17]=200;assert(!c.command(f,100));assert(c.frequency==1000);cases++;}
  {MotorCore c;c.ready=true;c.connect(1,0);c.command(frame(c,ESTOP),100);auto nonce=c.nonce;c.command(frame(c,HEARTBEAT),120);assert(c.nonce==nonce&&c.estop&&!c.armed&&std::string(c.reason)=="emergency");cases++;}
  {MotorCore c;c.ready=true;c.connect(1,0);arm(c,100,true);assert(!c.command(frame(c,PATTERN,6),101));assert(std::string(c.reason)=="pattern-uncalibrated");cases++;}
  {MotorCore c;c.ready=true;c.connect(1,0);auto save=frame(c,SAVE_PATTERN,7,50);save.data[17]=150;assert(c.command(save,100));assert(c.patterns[7].speed==50&&c.patterns[7].durationMs==150);arm(c,100,true);assert(c.command(frame(c,PATTERN,7),101));c.tick(151);assert(c.left==50&&c.right==-50);c.tick(251);assert(!c.armed&&c.left==0&&c.right==0);cases++;}
  {MotorCore c;c.ready=true;c.connect(1,0);auto save=frame(c,SAVE_PATTERN,0,75);save.data[17]=200;assert(!c.command(save,100));assert(c.patterns[0].speed==25);cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);auto a=frame(c,ARM);a.data[16]=1;assert(!c.command(a,100));assert(!c.command(frame(c,ARM),200));assert(!c.armed&&!c.powerQualified);cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);armSingle(c);assert(c.command(frame(c,MOVE,75,0),101));c.tick(176);assert(c.left==75&&c.right==0);c.command(frame(c,HEARTBEAT),180);c.tick(201);assert(!c.armed&&c.left==0&&std::string(c.reason)=="pulse-limit");cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);armSingle(c);assert(c.command(frame(c,MOVE,0,-50),101));c.tick(151);assert(c.left==0&&c.right==-50);c.tick(201);assert(!c.armed&&c.right==0);cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);armSingle(c);assert(!c.command(frame(c,MOVE,25,25),101));assert(!c.armed&&c.left==0&&c.right==0);cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);armSingle(c);assert(!c.command(frame(c,MOVE,76,0),101));assert(!c.armed);cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);auto f=frame(c,CONFIG);f.data[12]=0xe8;f.data[13]=3;f.data[17]=0xf4;f.data[18]=1;assert(!c.command(f,100));assert(!c.armed);cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);armSingle(c);assert(!c.command(frame(c,PATTERN,0),101));assert(!c.armed&&std::string(c.reason)=="single-pattern-disabled");cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);armSingle(c);auto old=frame(c,MOVE,25,0);c.disconnect(101);c.connect(2,102);assert(!c.command(old,202));assert(!c.armed&&c.left==0);cases++;}
  {MotorCore c(false,true);c.ready=true;c.connect(1,0);armSingle(c);c.pulseMs=500;assert(c.command(frame(c,MOVE,25,0),101));c.tick(201);assert(!c.armed&&c.left==0);cases++;}
  std::cout<<"MotorCore: "<<cases<<" safety cases passed\n";
}
