#pragma once
#include <stdint.h>
#include <string.h>
#include "MotorCore.h"

namespace colon {
constexpr int LCD_MOSI=21,LCD_SCLK=17,LCD_CS=15,LCD_DC=33,LCD_RESET=34,LCD_LIGHT=16;
constexpr bool lcdPinSafe(int pin){return pin<5||pin>8;}
static_assert(lcdPinSafe(LCD_MOSI)&&lcdPinSafe(LCD_SCLK)&&lcdPinSafe(LCD_CS)&&lcdPinSafe(LCD_DC)&&lcdPinSafe(LCD_RESET)&&lcdPinSafe(LCD_LIGHT),"LCD/motor GPIO conflict");
enum class DisplayState {Boot,Waiting,Connected,Armed,Moving,Emergency,Fault};
struct DisplaySnapshot {
  bool ready=false,connected=false,armed=false,estop=false,advertising=false,single=false;
  int left=0,right=0;
  uint32_t uptimeSeconds=0;
  const char* reason="boot";
};
inline DisplaySnapshot displaySnapshot(const MotorCore& motor,uint32_t now,bool advertising){
  DisplaySnapshot out;out.ready=motor.ready;out.connected=motor.connected;out.armed=motor.armed;out.estop=motor.estop;out.advertising=advertising;out.single=motor.singleTest;
  out.left=motor.left;out.right=motor.right;out.uptimeSeconds=now/1000;out.reason=motor.reason;return out;
}
inline DisplayState displayState(const DisplaySnapshot& s){
  if(s.estop)return DisplayState::Emergency;
  if(!s.ready)return DisplayState::Fault;
  if(!s.advertising)return DisplayState::Boot;
  if(!s.connected)return DisplayState::Waiting;
  if(s.left||s.right)return DisplayState::Moving;
  return s.armed?DisplayState::Armed:DisplayState::Connected;
}
inline const char* displayTitle(DisplayState state){
  switch(state){case DisplayState::Boot:return "起動中";case DisplayState::Waiting:return "接続待ち";case DisplayState::Connected:return "接続済み";case DisplayState::Armed:return "駆動許可";case DisplayState::Moving:return "駆動中";case DisplayState::Emergency:return "緊急停止";default:return "初期化失敗";}
}
inline const char* displayReason(const DisplaySnapshot& s){
  if(s.estop)return "再許可は別操作";
  if(!strcmp(s.reason,"heartbeat-timeout"))return "心拍切れ・停止";
  if(!strcmp(s.reason,"pulse-limit"))return "時間上限・停止";
  if(!strcmp(s.reason,"operator-stop"))return "操作で停止";
  if(!strcmp(s.reason,"running"))return "指令出力中";
  if(s.armed)return "1回のみ許可";
  return "停止・許可なし";
}
inline bool sameDisplay(const DisplaySnapshot& a,const DisplaySnapshot& b){
  return a.ready==b.ready&&a.connected==b.connected&&a.armed==b.armed&&a.estop==b.estop&&a.advertising==b.advertising&&a.single==b.single&&a.left==b.left&&a.right==b.right&&a.uptimeSeconds==b.uptimeSeconds&&!strcmp(a.reason,b.reason);
}
}
