#pragma once
#include <stdint.h>
namespace colon {
constexpr uint8_t PATTERN_COUNT=12;
constexpr uint8_t PROGRAM_COUNT=10;
constexpr uint16_t STRAIGHT_MS=1000;
struct PatternConfig {uint8_t speed;uint16_t durationMs;};
inline PatternConfig defaultPattern(uint8_t id,bool program=false){
  if(program)return {100,uint16_t(id<2?STRAIGHT_MS:0)};
  return {uint8_t(id<6?25*(id%3+1):25),uint16_t(id<6?200:0)};
}
inline bool validPattern(uint8_t id,const PatternConfig& p,bool program=false){
  if(program){
    if(id<2)return p.speed==100&&p.durationMs==STRAIGHT_MS;
    return id<PROGRAM_COUNT&&p.speed==100
      &&(p.durationMs==0||(p.durationMs>=50&&p.durationMs<=(id>=8?2000:500)));
  }
  return id<PATTERN_COUNT&&(p.speed==25||p.speed==50||p.speed==75)&&(id>=6||p.speed==25*(id%3+1))&&(p.durationMs==0||(p.durationMs>=50&&p.durationMs<=500));
}
inline void patternOutputs(uint8_t id,int speed,int& left,int& right,bool program=false){
  if(program){
    if(id<2){left=right=id==0?speed:-speed;}
    else if(id<5||id==8){left=-speed;right=speed;}
    else{left=speed;right=-speed;}
    return;
  }
  if(id<3){left=right=speed;}else if(id<6){left=right=-speed;}else if(id<9){left=speed;right=-speed;}else{left=-speed;right=speed;}
}
inline void swapProgramTurns(PatternConfig* slots){
  for(uint8_t i=2;i<5;i++){
    const auto previous=slots[i];slots[i]=slots[i+3];slots[i+3]=previous;
  }
}
}
