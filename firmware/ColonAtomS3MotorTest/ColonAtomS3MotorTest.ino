#include <Arduino.h>
#ifndef COLON_PHONE_MODE
#define COLON_PHONE_MODE 0
#endif
#include <WiFi.h>
#if !COLON_PHONE_MODE
#include <WebServer.h>
#endif
#include <Preferences.h>
#include <ArduinoJson.h>
#include <esp_timer.h>
#include <esp_system.h>
#include <driver/gpio.h>
#include "MotorSafety.h"
#ifndef COLON_PHONE_MODE
#define COLON_PHONE_MODE 0
#endif
#if COLON_PHONE_MODE
#include "generated/PhoneConfig.h"
#else
#include "generated/WebAssets.h"
#endif

#ifndef COLON_ENABLE_OUTPUTS
#define COLON_ENABLE_OUTPUTS 0
#endif
#ifndef COLON_POWER_QUALIFIED
#define COLON_POWER_QUALIFIED 0
#endif
// Default build: diagnostics only, no ARM can produce PWM.
// Enabling outputs is a separate build-time decision AFTER wiring/power review.
static const int PINS[4]={5,6,7,8};
#if COLON_PHONE_MODE
static const char* VERSION="colon-atoms3-phone-1.0.0";
#else
static const char* VERSION="colon-atoms3-motor-1.0.0";
#endif
colon::MotorSafety motor(false,COLON_ENABLE_OUTPUTS!=0,COLON_POWER_QUALIFIED!=0);
portMUX_TYPE motorMux=portMUX_INITIALIZER_UNLOCKED;
#if !COLON_PHONE_MODE
WebServer server(80);
#endif
esp_timer_handle_t safetyTimer=nullptr;
char sessionToken[33]={0},bootId[17]={0};
uint32_t bootCount=0;
int configuredHz=1000,lastLeft=999,lastRight=999;
bool pwmReady=false;

void randomHex(char* out,int bytes) {
  static const char hex[]="0123456789abcdef";
  for(int i=0;i<bytes;i++) { uint8_t v=uint8_t(esp_random()); out[2*i]=hex[v>>4]; out[2*i+1]=hex[v&15]; }
  out[2*bytes]=0;
}
const char* resetReason() {
  switch(esp_reset_reason()) {
    case ESP_RST_POWERON:return "power-on"; case ESP_RST_BROWNOUT:return "brownout";
    case ESP_RST_SW:return "software-reset"; case ESP_RST_PANIC:return "panic";
    case ESP_RST_INT_WDT:case ESP_RST_TASK_WDT:case ESP_RST_WDT:return "watchdog";
    default:return "other-or-unknown";
  }
}
void forceStop(const char* reason,bool disconnect=false) {
  uint32_t now=millis(); portENTER_CRITICAL(&motorMux);
  if(disconnect) { motor.disconnect(now); motor.stopReason=reason; } else motor.stop(reason,now);
  portEXIT_CRITICAL(&motorMux);
}
void writeOutputs(int left,int right,int hz) {
  if(!pwmReady) return;
  if(left==lastLeft&&right==lastRight&&hz==configuredHz) return;
  // Coast first: never transiently set both inputs HIGH during a direction change.
  for(int pin:PINS) ledcWrite(pin,0);
  if(hz!=configuredHz) {
    bool ok=true;
    for(int pin:PINS) if(ledcChangeFrequency(pin,hz,8)==0) ok=false;
    if(!ok) {
      forceStop("pwm-config-failed"); portENTER_CRITICAL(&motorMux); motor.gpioReady=false; portEXIT_CRITICAL(&motorMux);
      lastLeft=lastRight=0; return;
    }
    configuredHz=hz;
  }
  if(COLON_ENABLE_OUTPUTS) {
    if(left) ledcWrite(PINS[left>0?0:1],uint32_t(abs(left))*255/100);
    if(right) ledcWrite(PINS[right>0?2:3],uint32_t(abs(right))*255/100);
  }
  lastLeft=left; lastRight=right;
}
void safetyTick(void*) {
  // ESP_TIMER_TASK runs separately from WebServer::handleClient and HTTP parsing.
  uint32_t now=millis(); int left,right,hz;
  portENTER_CRITICAL(&motorMux);
  motor.tick(now); left=motor.left; right=motor.right; hz=motor.settings.pwmHz;
  portEXIT_CRITICAL(&motorMux);
  writeOutputs(left,right,hz);
}
void statusJson(JsonObject out) {
  portENTER_CRITICAL(&motorMux); auto s=motor; portEXIT_CRITICAL(&motorMux);
  out["protocol"]=1; out["source"]="device"; out["firmware"]=VERSION; out["bootId"]=bootId;
  out["bootCount"]=bootCount; out["resetReason"]=resetReason(); out["uptimeMs"]=millis(); out["lastHeartbeatMs"]=s.lastHeartbeatMs;
  out["connected"]=s.connected; out["gpioReady"]=s.gpioReady; out["outputsEnabled"]=s.outputsEnabled; out["powerQualified"]=s.powerQualified;
  out["armed"]=s.armed; out["estop"]=s.estop; out["active"]=s.active; out["left"]=s.left; out["right"]=s.right;
  out["targetLeft"]=s.targetLeft; out["targetRight"]=s.targetRight; out["stopReason"]=s.stopReason; out["lastSeq"]=s.lastSeq; out["stage"]=s.stage;
  JsonObject cfg=out["settings"].to<JsonObject>();
  cfg["leftPercent"]=s.settings.leftPercent; cfg["rightPercent"]=s.settings.rightPercent;
  cfg["pwmHz"]=s.settings.pwmHz; cfg["softStartMs"]=s.settings.softStartMs; cfg["pulseMs"]=s.settings.pulseMs;
  cfg["invertLeft"]=s.settings.invertLeft; cfg["invertRight"]=s.settings.invertRight;
}
#if !COLON_PHONE_MODE
void sendJson(JsonDocument& doc,int code=200) {
  String body; serializeJson(doc,body); server.sendHeader("Cache-Control","no-store");
  server.sendHeader("X-Content-Type-Options","nosniff"); server.send(code,"application/json",body);
}
void errorJson(const char* error,int code=400) { JsonDocument doc; doc["error"]=error; sendJson(doc,code); }
void sendStatus() { JsonDocument doc; statusJson(doc.to<JsonObject>()); sendJson(doc); }
bool allowedOrigin() {
  String origin=server.header("Origin"),host=server.header("Host");
  return (origin.isEmpty()||origin=="http://192.168.4.1")&&(host=="192.168.4.1"||host=="192.168.4.1:80");
}
bool authenticated() {
  bool connected; portENTER_CRITICAL(&motorMux); connected=motor.connected; portEXIT_CRITICAL(&motorMux);
  return connected&&sessionToken[0]&&server.header("X-Colon-Session")==sessionToken;
}
bool readJson(JsonDocument& doc) {
  if(!allowedOrigin()) { errorJson("origin-denied",403); return false; }
  if(server.arg("plain").length()>768||deserializeJson(doc,server.arg("plain"))||!doc.is<JsonObject>()) {
    if(authenticated()) forceStop("invalid-json"); errorJson("invalid-json"); return false;
  }
  return true;
}
#endif
bool integerField(JsonVariantConst v,int minimum,int maximum,int& result) {
  if(!v.is<int>()) return false; result=v.as<int>(); return result>=minimum&&result<=maximum;
}
colon::Action parseAction(const String& action) {
  if(action=="ARM") return colon::Action::Arm; if(action=="DISARM") return colon::Action::Disarm;
  if(action=="DRIVE") return colon::Action::Drive; if(action=="HOLD") return colon::Action::Hold;
  if(action=="HEARTBEAT") return colon::Action::Heartbeat; if(action=="STOP") return colon::Action::Stop;
  if(action=="ESTOP") return colon::Action::Estop; if(action=="RESET") return colon::Action::Reset;
  if(action=="CONFIG") return colon::Action::Config; return colon::Action::Unknown;
}
bool parseCommand(JsonDocument& doc,colon::Command& c) {
  int seq; if(!integerField(doc["seq"],1,2147483647,seq)||!doc["type"].is<const char*>()) return false;
  c.seq=uint32_t(seq); c.type=parseAction(doc["type"].as<String>());
  if(c.type==colon::Action::Unknown) return false;
  if(c.type==colon::Action::Drive||c.type==colon::Action::Hold) {
    int press; if(!integerField(doc["press"],1,2147483647,press)) return false; c.press=uint32_t(press);
  }
  if(c.type==colon::Action::Drive&&(!integerField(doc["left"],-1,1,c.left)||!integerField(doc["right"],-1,1,c.right))) return false;
  if(c.type==colon::Action::Config) {
    auto cfg=doc["settings"];
    if(!integerField(cfg["leftPercent"],0,100,c.settings.leftPercent)||!integerField(cfg["rightPercent"],0,100,c.settings.rightPercent)
      ||!integerField(cfg["pwmHz"],500,20000,c.settings.pwmHz)||!integerField(cfg["softStartMs"],50,1000,c.settings.softStartMs)
      ||!integerField(cfg["pulseMs"],50,500,c.settings.pulseMs)||!cfg["invertLeft"].is<bool>()||!cfg["invertRight"].is<bool>()) return false;
    c.settings.invertLeft=cfg["invertLeft"].as<bool>(); c.settings.invertRight=cfg["invertRight"].as<bool>();
  }
  if(c.type==colon::Action::Arm) {
    if(!integerField(doc["stage"],2,7,c.stage)) return false;
    auto checks=doc["checks"]; const char* keys[]={"wiring","physicalSwitch","raised","vmOff","voltageMeasured","currentReviewed"};
    for(int i=0;i<6;i++) { if(!checks[keys[i]].is<bool>()) return false; if(checks[keys[i]].as<bool>()) c.checks|=1U<<i; }
    if(c.stage>=5&&!integerField(doc["measuredMv"],1,1500,c.measuredMv)) return false;
  }
  return true;
}
#if !COLON_PHONE_MODE
void handleCommand(bool stopOnly) {
  JsonDocument doc; if(!readJson(doc)) return;
  if(!authenticated()) { errorJson("session-denied",403); return; }
  colon::Command c;
  if(!parseCommand(doc,c)||(stopOnly&&c.type!=colon::Action::Stop&&c.type!=colon::Action::Estop)) {
    forceStop("invalid-command"); errorJson("invalid-command"); return;
  }
  uint32_t now=millis(); portENTER_CRITICAL(&motorMux); const char* error=motor.command(c,now); portEXIT_CRITICAL(&motorMux);
  if(error) { errorJson(error); return; } sendStatus();
}
void serveAsset(const WebAsset* asset) {
  server.sendHeader("Content-Encoding","gzip"); server.sendHeader("Cache-Control","no-store");
  server.sendHeader("X-Content-Type-Options","nosniff");
  server.sendHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  server.send_P(200,asset->mime,reinterpret_cast<const char*>(asset->data),asset->length);
}
#else
#include "PhoneServer.h"
#endif
void setup() {
  // No display, IMU, BLE, recognition, or autonomous movement is initialized here.
  pwmReady=colon::validPins(PINS);
  // Validate every pin BEFORE changing any pin direction.
  if(pwmReady) {
    for(int pin:PINS) {
      if(gpio_set_level(gpio_num_t(pin),0)!=ESP_OK || gpio_set_direction(gpio_num_t(pin),GPIO_MODE_OUTPUT)!=ESP_OK) pwmReady=false;
    }
    if(pwmReady) {
      for(int i=0;i<4;i++) { if(!ledcAttachChannel(PINS[i],1000,8,i)) pwmReady=false; ledcWrite(PINS[i],0); }
    }
  }
  motor.begin(pwmReady,millis());
  esp_timer_create_args_t args={}; args.callback=safetyTick; args.name="colon-motor-safety"; args.dispatch_method=ESP_TIMER_TASK;
  if(esp_timer_create(&args,&safetyTimer)!=ESP_OK||esp_timer_start_periodic(safetyTimer,10000)!=ESP_OK) {
    motor.gpioReady=false; motor.stop("safety-timer-failed",millis());
  }
  Serial.begin(115200);
  Preferences prefs;
  if(prefs.begin("colon-motor",false)) { bootCount=prefs.getUInt("boots",0)+1; prefs.putUInt("boots",bootCount); prefs.end(); }
  randomHex(bootId,8);
#if COLON_PHONE_MODE
  startPhoneNetwork();
#else
  char password[13]; randomHex(password,6);
  String ssid="ColonMotor-"+String(uint32_t(ESP.getEfuseMac())&0xffff,HEX);
  WiFi.mode(WIFI_AP); WiFi.softAPConfig(IPAddress(192,168,4,1),IPAddress(192,168,4,1),IPAddress(255,255,255,0));
  WiFi.softAP(ssid.c_str(),password,1,false,1);
  Serial.printf("%s\nWi-Fi: %s\nPassword (this boot only): %s\nURL: http://192.168.4.1/\n",VERSION,ssid.c_str(),password);
  const char* headers[]={"Origin","Host","X-Colon-Session"}; server.collectHeaders(headers,3);
  server.on("/api/status",HTTP_GET,sendStatus);
  server.on("/api/session",HTTP_POST,[] {
    JsonDocument input; if(!readJson(input)) return;
    if(!input["protocol"].is<int>()||input["protocol"].as<int>()!=1) { errorJson("protocol-mismatch"); return; }
    uint32_t now=millis(); portENTER_CRITICAL(&motorMux); motor.tick(now); bool occupied=motor.connected; portEXIT_CRITICAL(&motorMux);
    if(occupied) { errorJson("controller-already-connected",409); return; }
    randomHex(sessionToken,16); portENTER_CRITICAL(&motorMux); motor.connect(now); portEXIT_CRITICAL(&motorMux);
    JsonDocument reply; reply["token"]=sessionToken; statusJson(reply["status"].to<JsonObject>()); sendJson(reply);
  });
  server.on("/api/command",HTTP_POST,[] { handleCommand(false); });
  server.on("/api/stop",HTTP_POST,[] { handleCommand(true); });
  server.on("/api/disconnect",HTTP_POST,[] {
    if(!allowedOrigin()||!authenticated()) { errorJson("session-denied",403); return; }
    forceStop("disconnected",true); sessionToken[0]=0; sendStatus();
  });
  for(size_t i=0;i<WEB_ASSET_COUNT;i++) { const WebAsset* asset=&WEB_ASSETS[i]; server.on(asset->path,HTTP_GET,[asset] { serveAsset(asset); }); }
  server.on("/",HTTP_GET,[] { serveAsset(&WEB_ASSETS[0]); });
  server.onNotFound([] { errorJson("not-found",404); }); server.begin();
#endif
}
void loop() {
#if COLON_PHONE_MODE
  phoneLoop();
#else
  server.handleClient();
  if(WiFi.softAPgetStationNum()==0) {
    portENTER_CRITICAL(&motorMux); bool connected=motor.connected; portEXIT_CRITICAL(&motorMux);
    if(connected) forceStop("wifi-disconnected",true);
  }
#endif
  delay(1);
}
