#include <Arduino.h>
#include <M5GFX.h>
#include <lgfx/v1/panel/Panel_GC9A01.hpp>
#include "AtomStatusDisplay.h"

namespace {
// Explicit C123/GC9107 configuration: no other-board probing or motor GPIO access.
class AtomLcd:public lgfx::LGFX_Device {
  lgfx::Bus_SPI bus;
  lgfx::Panel_GC9107 panel;
public:
  AtomLcd(){
    auto spi=bus.config();spi.spi_host=SPI3_HOST;spi.spi_mode=0;spi.freq_write=40000000;spi.freq_read=16000000;
    spi.pin_sclk=colon::LCD_SCLK;spi.pin_mosi=colon::LCD_MOSI;spi.pin_miso=-1;spi.pin_dc=colon::LCD_DC;spi.spi_3wire=true;spi.use_lock=true;bus.config(spi);panel.setBus(&bus);
    auto cfg=panel.config();cfg.pin_cs=colon::LCD_CS;cfg.pin_rst=colon::LCD_RESET;cfg.panel_width=128;cfg.panel_height=128;cfg.offset_y=32;cfg.readable=false;cfg.bus_shared=false;panel.config(cfg);setPanel(&panel);
  }
};
AtomLcd lcd;
lgfx::LGFX_Sprite frame(&lcd);
bool initialized=false,hasPrevious=false;
colon::DisplaySnapshot previous;
uint16_t stateColor(colon::DisplayState state){
  switch(state){case colon::DisplayState::Emergency:case colon::DisplayState::Fault:return 0xB104;case colon::DisplayState::Armed:case colon::DisplayState::Moving:return 0xA420;case colon::DisplayState::Connected:return 0x1B68;default:return 0x124A;}
}
}
bool beginAtomStatusDisplay(){
  if(!lcd.init())return false;
  lcd.setRotation(0);lcd.fillScreen(0);
  // Constant HIGH brightness: does not allocate any motor LEDC channel/timer.
  pinMode(colon::LCD_LIGHT,OUTPUT);digitalWrite(colon::LCD_LIGHT,HIGH);
  frame.setColorDepth(8);if(!frame.createSprite(128,128))return false;
  frame.setFont(&lgfx::fonts::efontJA_12);frame.setTextWrap(false);initialized=true;return true;
}
void drawAtomStatus(const colon::DisplaySnapshot& s,const char* version){
  if(!initialized||(hasPrevious&&colon::sameDisplay(previous,s)))return;
  previous=s;hasPrevious=true;
  const auto state=colon::displayState(s);const auto color=stateColor(state);
  frame.fillScreen(0);frame.setTextSize(1);frame.setTextColor(0xFFFF);frame.setCursor(4,2);frame.printf("ATOM S3 %s",version);
  frame.fillRect(116,4,6,6,(s.uptimeSeconds&1)?0x07E0:0x0320);
  frame.fillRoundRect(0,17,128,24,3,color);frame.setTextSize(1.5);frame.drawString(colon::displayTitle(state),4,19);
  frame.setTextSize(1);frame.setTextColor(0xFFFF);frame.drawString(s.connected?"BLE: 接続済み":"BLE: 未接続",4,46);
  frame.drawString(colon::displayReason(s),4,62);frame.setCursor(4,79);frame.printf("指令 L:%+d R:%+d",s.left,s.right);
  frame.setTextColor(0xFFE0);
  const char* mode=s.startupResult?s.startupResult:s.rc?"ラジコン試験":s.single?"片側100ms試験":"VMなし信号試験";
  frame.drawString(mode,4,95);
  frame.setTextColor(0xBDF7);frame.drawString(s.rc||s.startupResult?"VM手動確認":"VM未測定",4,112);frame.setCursor(83,112);if(s.uptimeSeconds<10000)frame.printf("%lus",(unsigned long)s.uptimeSeconds);else frame.printf("%lum",(unsigned long)(s.uptimeSeconds/60));
  frame.pushSprite(0,0);
}
