#pragma once
#include <stdint.h>
namespace colon {
constexpr uint8_t PATTERN_COUNT=12;
struct PatternConfig {uint8_t speed;uint16_t durationMs;};
inline PatternConfig defaultPattern(uint8_t id){return {uint8_t(id<6?25*(id%3+1):25),uint16_t(id<6?200:0)};}
inline bool validPattern(uint8_t id,const PatternConfig& p){
  return id<PATTERN_COUNT&&(p.speed==25||p.speed==50||p.speed==75)&&(id>=6||p.speed==25*(id%3+1))&&(p.durationMs==0||(p.durationMs>=50&&p.durationMs<=500));
}
inline void patternOutputs(uint8_t id,int speed,int& left,int& right){
  if(id<3){left=right=speed;}else if(id<6){left=right=-speed;}else if(id<9){left=speed;right=-speed;}else{left=-speed;right=speed;}
}
}
