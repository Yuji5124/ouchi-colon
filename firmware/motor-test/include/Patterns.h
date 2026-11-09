#pragma once
#include <stdint.h>
namespace colon {
constexpr uint8_t PATTERN_COUNT=12;
constexpr uint8_t PROGRAM_COUNT=10;
constexpr uint16_t STRAIGHT_MS=1000;
constexpr uint16_t MAX_SHARED_TURN_MS=12000;
inline uint8_t pairedTurn(uint8_t id){return id<5?id+3:id<8?id-3:id==8?9:8;}
inline uint16_t commonTurnTime(uint8_t id){return id>=8?1500:uint16_t(((id-2)%3+1)*250);}
struct PatternConfig {uint8_t speed;uint16_t durationMs;};
inline PatternConfig defaultPattern(uint8_t id,bool program=false){
  if(program)return {100,uint16_t(id<2?STRAIGHT_MS:commonTurnTime(id))};
  return {uint8_t(id<6?25*(id%3+1):25),uint16_t(id<6?200:0)};
}
inline bool validPattern(uint8_t id,const PatternConfig& p,bool program=false){
  if(program){
    if(id<2)return p.speed==100&&p.durationMs==STRAIGHT_MS;
    return id<PROGRAM_COUNT&&p.speed==100
      &&(p.durationMs==0||(p.durationMs>=50&&p.durationMs<=MAX_SHARED_TURN_MS));
  }
  return id<PATTERN_COUNT&&(p.speed==25||p.speed==50||p.speed==75)&&(id>=6||p.speed==25*(id%3+1))&&(p.durationMs==0||(p.durationMs>=50&&p.durationMs<=500));
}
inline bool validStoredPattern(uint8_t id,const PatternConfig& p,uint8_t version){
  if(version==6||version==7)return validPattern(id,p,true);
  if(version<3||version>5||id>=(version==5?10:8))return false;
  if(id<2)return p.speed==100&&p.durationMs==STRAIGHT_MS;
  return p.speed==100&&(p.durationMs==0||(p.durationMs>=50&&p.durationMs<=(id>=8?2000:500)));
}
inline bool commonTurnsMatch(const PatternConfig* slots){
  for(uint8_t id=2;id<10;id++){const auto& a=slots[id];const auto& b=slots[pairedTurn(id)];if(a.speed!=b.speed||a.durationMs!=b.durationMs)return false;}return true;
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
