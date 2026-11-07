#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Preferences.h>
#include <esp_system.h>
#include <atomic>
#include "MotorCore.h"
#include "AtomStatusDisplay.h"

#ifndef MOTOR_ALLOW_POWERED_TESTS
#define MOTOR_ALLOW_POWERED_TESTS 0
#endif
#ifndef MOTOR_SINGLE_TEST
#define MOTOR_SINGLE_TEST 0
#endif
#ifndef MOTOR_RC_TEST
#define MOTOR_RC_TEST 0
#endif
#ifndef MOTOR_BOOT_TEST
#define MOTOR_BOOT_TEST 0
#endif
#ifndef MOTOR_BOOT_DUAL_TEST
#define MOTOR_BOOT_DUAL_TEST 0
#endif
#ifndef MOTOR_PROGRAM
#define MOTOR_PROGRAM 0
#endif
#if MOTOR_BOOT_TEST
#include "BootTrial.h"
#endif
static_assert(!(MOTOR_SINGLE_TEST && MOTOR_RC_TEST), "Select one motor test target");
static_assert(!(MOTOR_RC_TEST && MOTOR_ALLOW_POWERED_TESTS), "RC trials cannot certify the supply");
static_assert(!(MOTOR_BOOT_TEST && (MOTOR_SINGLE_TEST || MOTOR_RC_TEST || MOTOR_ALLOW_POWERED_TESTS)),
              "The boot trial must be a standalone target");
#if MOTOR_BOOT_TEST
#if MOTOR_BOOT_DUAL_TEST
#define COLON_FIRMWARE_VERSION "1.4.2"
constexpr char SINGLE_TEST_TAG[]="COLON_SINGLE_TEST=0;COLON_BOOT_TEST=1;COLON_BOOT_DUAL_TEST=1";
#else
#define COLON_FIRMWARE_VERSION "1.4.0"
constexpr char SINGLE_TEST_TAG[]="COLON_SINGLE_TEST=0;COLON_BOOT_TEST=1";
#endif
const char* startupResult="起動試験なし";
#elif MOTOR_PROGRAM
#define COLON_FIRMWARE_VERSION "1.6.0"
constexpr char SINGLE_TEST_TAG[]="COLON_SINGLE_TEST=0;COLON_RC_TEST=1;COLON_PROGRAM=1;COLON_DIRECT=1";
#elif MOTOR_RC_TEST
#define COLON_FIRMWARE_VERSION "1.3.0"
constexpr char SINGLE_TEST_TAG[]="COLON_SINGLE_TEST=0;COLON_RC_TEST=1";
#elif MOTOR_SINGLE_TEST
#define COLON_FIRMWARE_VERSION "1.2.1"
constexpr char SINGLE_TEST_TAG[]="COLON_SINGLE_TEST=1";
#else
#define COLON_FIRMWARE_VERSION "1.1.1"
constexpr char SINGLE_TEST_TAG[]="COLON_SINGLE_TEST=0";
#endif
#if MOTOR_ALLOW_POWERED_TESTS
constexpr char BUILD_LOCK_TAG[]="COLON_POWER_LOCK=1";
#else
constexpr char BUILD_LOCK_TAG[]="COLON_POWER_LOCK=0";
#endif
// ATOM S3 C123 only. LCD uses its dedicated pins; IMU is not initialized.
constexpr int AIN1=5, AIN2=6, BIN1=7, BIN2=8;
static_assert(colon::validPins(AIN1,AIN2,BIN1,BIN2),"Motor GPIO conflict");
constexpr char SERVICE[]="b4c00001-70f0-4c21-a560-cc0100000001";
constexpr char COMMAND[]="b4c00002-70f0-4c21-a560-cc0100000001";
constexpr char MOTOR_STATUS_UUID[]="b4c00003-70f0-4c21-a560-cc0100000001";
constexpr char MOTOR_PATTERNS_UUID[]="b4c00004-70f0-4c21-a560-cc0100000001";
constexpr int pins[]={AIN1,AIN2,BIN1,BIN2};
colon::MotorCore motor(MOTOR_ALLOW_POWERED_TESTS==1,MOTOR_SINGLE_TEST==1,MOTOR_RC_TEST==1,MOTOR_PROGRAM==1);
QueueHandle_t commands;
std::atomic<int> connectionEvent{0};
std::atomic<bool> urgentStop{false},urgentEstop{false};
portMUX_TYPE statusMux=portMUX_INITIALIZER_UNLOCKED;
char statusBuffer[512]="{}";
char patternsBuffer[256]="{}";
colon::DisplaySnapshot latestDisplay;
std::atomic<bool> bleReady{false},lcdReady{false};
uint32_t bootCount=0, bootId=0;
bool bootCountKnown=false;
const char* resetReason="unknown";
BLECharacteristic* statusChar=nullptr;
BLEServer* bleServer=nullptr;

const char* resetName(esp_reset_reason_t reason){
  switch(reason){case ESP_RST_POWERON:return "power-on";case ESP_RST_SW:return "software";case ESP_RST_PANIC:return "panic";case ESP_RST_INT_WDT:return "interrupt-watchdog";case ESP_RST_TASK_WDT:return "task-watchdog";case ESP_RST_WDT:return "watchdog";case ESP_RST_BROWNOUT:return "brownout";case ESP_RST_DEEPSLEEP:return "deep-sleep";default:return "other";}
}
void writePair(int channel,int value){
  const uint32_t duty=uint32_t(abs(value))*255/100;
  // Clear both inputs before asserting a direction. Stops are 00 / Hi-Z coast.
  ledcWrite(channel,0);ledcWrite(channel+1,0);
  if(value>0)ledcWrite(channel,duty);else if(value<0)ledcWrite(channel+1,duty);
}
void publishStatus(uint32_t now){
  char out[512];
  snprintf(out,sizeof(out),"{\"protocol\":1,\"firmware\":\"colon-motor-" COLON_FIRMWARE_VERSION "\",\"patternsVersion\":%u,\"bootId\":%lu,\"bootCount\":%s,\"uptimeMs\":%lu,\"resetReason\":\"%s\",\"nonce\":%lu,\"seq\":%lu,\"connected\":%s,\"gpioReady\":%s,\"armed\":%s,\"estop\":%s,\"powerQualified\":%s,\"signalOnly\":%s,\"singleTest\":%s,\"lcd\":%s,\"left\":%d,\"right\":%d,\"physicalLeft\":%d,\"physicalRight\":%d,\"stopReason\":\"%s\",\"heartbeatAgeMs\":%lu,\"pulseMs\":%u,\"frequency\":%u}",
    motor.program?3u:1u,(unsigned long)bootId,bootCountKnown?String(bootCount).c_str():"null",(unsigned long)now,resetReason,(unsigned long)motor.nonce,(unsigned long)motor.seq,motor.connected?"true":"false",motor.ready?"true":"false",motor.armed?"true":"false",motor.estop?"true":"false",motor.powerQualified?"true":"false",motor.signalOnly?"true":"false",motor.singleTest?"true":"false",lcdReady.load()?"true":"false",motor.left,motor.right,motor.physicalLeft(),motor.physicalRight(),motor.reason,(unsigned long)(now-motor.heartbeatAt),motor.activePulseMs?motor.activePulseMs:motor.pulseMs,motor.frequency);
  portENTER_CRITICAL(&statusMux);strncpy(statusBuffer,out,sizeof(statusBuffer));statusBuffer[511]=0;portEXIT_CRITICAL(&statusMux);
  auto screen=colon::displaySnapshot(motor,now,bleReady.load());
#if MOTOR_BOOT_TEST
  screen.startupResult=startupResult;
#endif
  portENTER_CRITICAL(&statusMux);latestDisplay=screen;portEXIT_CRITICAL(&statusMux);
  char table[256]{};size_t used=snprintf(table,sizeof(table),"{\"version\":%u,\"build\":\"%s;%s\",\"slots\":[",motor.program?3u:1u,BUILD_LOCK_TAG,SINGLE_TEST_TAG);
  for(uint8_t i=0;i<motor.patternCount();i++)used+=snprintf(table+used,sizeof(table)-used,"%s[%u,%u]",i?",":"",motor.patterns[i].speed,motor.patterns[i].durationMs);
  snprintf(table+used,sizeof(table)-used,"]}");portENTER_CRITICAL(&statusMux);memcpy(patternsBuffer,table,sizeof(table));portEXIT_CRITICAL(&statusMux);
}
bool storePatterns(){
  uint8_t blob[1+colon::PATTERN_COUNT*3];blob[0]=motor.program?3:1;
  for(uint8_t i=0;i<motor.patternCount();i++){blob[1+i*3]=motor.patterns[i].speed;blob[2+i*3]=motor.patterns[i].durationMs&255;blob[3+i*3]=motor.patterns[i].durationMs>>8;}
  const size_t len=1+motor.patternCount()*3;
  Preferences p;if(!p.begin("colon-motor",false))return false;
  const bool ok=p.putBytes(motor.program?"patterns-v3":"patterns",blob,len)==len;p.end();return ok;
}
void loadPatterns(){
  uint8_t blob[1+colon::PATTERN_COUNT*3]{};Preferences p;if(!p.begin("colon-motor",true))return;
  const auto count=motor.patternCount();
  // Calibrations at lower duty are in the old keys. Full-duty trials start uncalibrated.
  const size_t len=p.getBytes(motor.program?"patterns-v3":"patterns",blob,sizeof(blob));p.end();
  if(len!=size_t(1+count*3)||blob[0]!=(motor.program?3:1))return;
  colon::PatternConfig slots[colon::PATTERN_COUNT]{};
  for(uint8_t i=0;i<count;i++){
    slots[i]={blob[1+i*3],uint16_t(blob[2+i*3]|uint16_t(blob[3+i*3])<<8)};
    if(!colon::validPattern(i,slots[i],motor.program))return;
  }
  memcpy(motor.patterns,slots,count*sizeof(slots[0]));
}
class StatusCallbacks: public BLECharacteristicCallbacks {
  void onRead(BLECharacteristic* c) override {char copy[512];portENTER_CRITICAL(&statusMux);memcpy(copy,statusBuffer,512);portEXIT_CRITICAL(&statusMux);c->setValue(copy);}
};
class PatternCallbacks: public BLECharacteristicCallbacks {
  void onRead(BLECharacteristic* c) override {char copy[256];portENTER_CRITICAL(&statusMux);memcpy(copy,patternsBuffer,256);portEXIT_CRITICAL(&statusMux);c->setValue(copy);}
};
class CommandCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    auto bytes=c->getValue();
    if(bytes.size()!=20){urgentStop.store(true);return;}
    colon::Frame frame;memcpy(frame.data,bytes.data(),20);
    if(frame.data[0]!=1){urgentStop.store(true);return;}
    if(frame.data[1]==colon::ESTOP){urgentEstop.store(true);return;}
    if(frame.data[1]==colon::STOP||frame.data[1]==colon::DISARM){urgentStop.store(true);return;}
    if(xQueueSend(commands,&frame,0)!=pdTRUE)urgentStop.store(true);
  }
};
class ServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer*) override {connectionEvent.store(1);}
  void onDisconnect(BLEServer* s) override {connectionEvent.store(-1);urgentStop.store(true);s->startAdvertising();}
};
void motorTask(void*) {
#if !MOTOR_BOOT_TEST
  uint16_t appliedFrequency=motor.frequency;
  int appliedLeft=0,appliedRight=0;
#endif
  TickType_t next=xTaskGetTickCount();
  for(;;){
    const uint32_t now=millis();
    const int event=connectionEvent.exchange(0);
    if(event){xQueueReset(commands);if(event<0)motor.disconnect(now);else motor.connect(esp_random(),now);}
    if(urgentEstop.exchange(false)){xQueueReset(commands);motor.estop=true;motor.stop("emergency",now);}
    if(urgentStop.exchange(false)){xQueueReset(commands);motor.stop(event<0?"disconnect":"operator-stop",now);}
    colon::Frame frame;
    // Bound command processing so floods cannot starve the safety tick.
    for(int count=0;count<4&&xQueueReceive(commands,&frame,0)==pdTRUE;count++){
#if MOTOR_BOOT_TEST
      if(frame.data[1]==colon::HEARTBEAT||frame.data[1]==colon::RESET_ESTOP)motor.command(frame,now);
      else motor.stop("boot-test-only",now);
#else
      if(motor.command(frame,now)&&frame.data[1]==colon::SAVE_PATTERN&&!storePatterns())motor.stop("pattern-save-failed",now);
#endif
    }
    motor.tick(now);
#if !MOTOR_BOOT_TEST
    if(appliedFrequency!=motor.frequency){
      for(int i=0;i<4;i++)ledcWrite(i,0);
      appliedLeft=appliedRight=0;
      bool ok=true;for(int i=0;i<4;i++)if(ledcSetup(i,motor.frequency,8)==0)ok=false;
      appliedFrequency=motor.frequency;if(!ok){motor.ready=false;motor.stop("pwm-init-failed",now);}
    }
    const int nextLeft=motor.physicalLeft(),nextRight=motor.physicalRight();
    if(nextLeft!=appliedLeft){writePair(0,nextLeft);appliedLeft=nextLeft;}
    if(nextRight!=appliedRight){writePair(2,nextRight);appliedRight=nextRight;}
#endif
    publishStatus(now);
    vTaskDelayUntil(&next,pdMS_TO_TICKS(5));
  }
}
void displayTask(void*){
  for(;;){colon::DisplaySnapshot copy;portENTER_CRITICAL(&statusMux);copy=latestDisplay;portEXIT_CRITICAL(&statusMux);drawAtomStatus(copy,COLON_FIRMWARE_VERSION);vTaskDelay(pdMS_TO_TICKS(20));}
}
void setup(){
  // No network, NVS, display, or BLE work is allowed before outputs are low.
  for(int pin:pins){digitalWrite(pin,LOW);pinMode(pin,OUTPUT);}
  bool ok=true;
#if MOTOR_BOOT_TEST
  startupResult=runBootTrial(AIN1,MOTOR_BOOT_DUAL_TEST ? BIN1 : -1,ok,esp_reset_reason());
#else
  for(int i=0;i<4;i++){if(ledcSetup(i,1000,8)==0)ok=false;ledcAttachPin(pins[i],i);ledcWrite(i,0);}
#endif
  motor.ready=ok;motor.stop(ok?"boot":"gpio-init-failed",millis());
  latestDisplay=colon::displaySnapshot(motor,millis(),false);
#if MOTOR_BOOT_TEST
  latestDisplay.startupResult=startupResult;
#endif
  const bool hasLcd=beginAtomStatusDisplay();if(hasLcd)drawAtomStatus(latestDisplay,COLON_FIRMWARE_VERSION);
  bootId=esp_random();resetReason=resetName(esp_reset_reason());
  Preferences prefs;
  if(prefs.begin("colon-motor",false)){bootCount=prefs.getUInt("boots",0)+1;bootCountKnown=prefs.putUInt("boots",bootCount)>0;prefs.end();}
  loadPatterns();
  commands=xQueueCreate(8,sizeof(colon::Frame));if(!commands){motor.ready=false;if(hasLcd)drawAtomStatus(colon::displaySnapshot(motor,millis(),false),COLON_FIRMWARE_VERSION);return;}
  if(xTaskCreatePinnedToCore(motorTask,"motor-safety",4096,nullptr,5,nullptr,1)!=pdPASS){motor.ready=false;if(hasLcd)drawAtomStatus(colon::displaySnapshot(motor,millis(),false),COLON_FIRMWARE_VERSION);return;}
  if(hasLcd)lcdReady.store(xTaskCreatePinnedToCore(displayTask,"lcd-status",6144,nullptr,1,nullptr,0)==pdPASS);
  BLEDevice::init("Colon-Motor-Test");
  bleServer=BLEDevice::createServer();bleServer->setCallbacks(new ServerCallbacks());
  BLEService* service=bleServer->createService(SERVICE);
  auto cmd=service->createCharacteristic(COMMAND,BLECharacteristic::PROPERTY_WRITE);cmd->setCallbacks(new CommandCallbacks());
  statusChar=service->createCharacteristic(MOTOR_STATUS_UUID,BLECharacteristic::PROPERTY_READ);statusChar->setCallbacks(new StatusCallbacks());
  auto patternsChar=service->createCharacteristic(MOTOR_PATTERNS_UUID,BLECharacteristic::PROPERTY_READ);patternsChar->setCallbacks(new PatternCallbacks());
  service->start();auto advertising=bleServer->getAdvertising();advertising->addServiceUUID(SERVICE);advertising->start();bleReady.store(true);
}
void loop(){delay(20);} // Safety: core1/prio5; LCD: core0/prio1. Neither waits on the other.
