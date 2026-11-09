#pragma once
#include <esp_https_server.h>
#include <ESPmDNS.h>
#include <M5GFX.h>
#include <lgfx/v1/panel/Panel_GC9A01.hpp>
#include "PhonePolicy.h"

// Explicit C123 pin map. Never autodetect other boards on motor GPIO5-8.
class ColonPhoneDisplay:public lgfx::LGFX_Device {
  lgfx::Bus_SPI bus; lgfx::Panel_GC9107 panel; lgfx::Light_PWM light;
public:
  ColonPhoneDisplay() {
    auto b=bus.config(); b.spi_host=SPI3_HOST; b.spi_mode=0; b.freq_write=40000000; b.freq_read=16000000;
    b.spi_3wire=true; b.pin_sclk=17; b.pin_mosi=21; b.pin_miso=-1; b.pin_dc=33; bus.config(b); panel.setBus(&bus);
    auto p=panel.config(); p.pin_cs=15; p.pin_rst=34; p.panel_width=128; p.panel_height=128; p.offset_y=32; p.readable=false; panel.config(p);
    auto l=light.config(); l.pin_bl=16; l.pwm_channel=7; l.freq=500; l.invert=false; light.config(l); panel.setLight(&light); setPanel(&panel);
  }
} phoneDisplay;
httpd_handle_t phoneServer=nullptr;
uint32_t pairWindow=0; unsigned pairAttempts=0;
bool displayReady=false;
String phoneHeader(httpd_req_t* req,const char* name) {
  size_t len=httpd_req_get_hdr_value_len(req,name); if(len==0||len>256) return String();
  char buffer[257]; if(httpd_req_get_hdr_value_str(req,name,buffer,sizeof(buffer))!=ESP_OK) return String(); return String(buffer);
}
esp_err_t phoneJson(httpd_req_t* req,JsonDocument& doc,const char* code="200 OK") {
  String text; serializeJson(doc,text); httpd_resp_set_status(req,code); httpd_resp_set_type(req,"application/json");
  httpd_resp_set_hdr(req,"Cache-Control","no-store"); httpd_resp_set_hdr(req,"X-Content-Type-Options","nosniff");
  return httpd_resp_send(req,text.c_str(),text.length());
}
esp_err_t phoneError(httpd_req_t* req,const char* message,const char* code="400 Bad Request") { JsonDocument doc; doc["error"]=message; return phoneJson(req,doc,code); }
bool phoneAuthenticated(httpd_req_t* req) {
  portENTER_CRITICAL(&motorMux); bool connected=motor.connected; portEXIT_CRITICAL(&motorMux);
  return connected&&sessionToken[0]&&phoneHeader(req,"X-Colon-Session")==sessionToken;
}
void phoneDrawEmotion(const String& emotion) {
  if(!displayReady) return;
  phoneDisplay.fillScreen(0xff7c); uint16_t ink=0x20c3;
  if(emotion=="SLEEPY") { phoneDisplay.fillRect(24,45,26,4,ink); phoneDisplay.fillRect(78,45,26,4,ink); }
  else { phoneDisplay.fillRoundRect(26,32,20,28,8,ink); phoneDisplay.fillRoundRect(82,32,20,28,8,ink); }
  if(emotion=="SURPRISE") phoneDisplay.fillCircle(64,88,12,ink);
  else if(emotion=="JOY") phoneDisplay.fillRoundRect(43,80,42,14,7,ink);
  else phoneDisplay.fillRect(48,86,32,4,ink);
}
esp_err_t phoneRequest(httpd_req_t* req) {
  if(!colon::phoneRouteAllowed(req->uri)) return phoneError(req,"not-found","404 Not Found");
  String origin=phoneHeader(req,"Origin");
  if(!colon::phoneOriginAllowed(origin.c_str(),PHONE_APP_ORIGIN)) return phoneError(req,"origin-denied","403 Forbidden");
  httpd_resp_set_hdr(req,"Access-Control-Allow-Origin",PHONE_APP_ORIGIN); httpd_resp_set_hdr(req,"Vary","Origin");
  if(req->method==HTTP_OPTIONS) {
    String method=phoneHeader(req,"Access-Control-Request-Method");
    if(method!="POST") return phoneError(req,"method-denied","405 Method Not Allowed");
    httpd_resp_set_hdr(req,"Access-Control-Allow-Methods","POST");
    httpd_resp_set_hdr(req,"Access-Control-Allow-Headers","Content-Type,X-Colon-Session,X-Colon-Pair");
    httpd_resp_set_hdr(req,"Access-Control-Max-Age","600");
    httpd_resp_set_status(req,"204 No Content"); return httpd_resp_send(req,nullptr,0);
  }
  if(req->method!=HTTP_POST) return phoneError(req,"method-denied","405 Method Not Allowed");
  if(req->content_len<=0||req->content_len>768) { if(phoneAuthenticated(req)) forceStop("phone-invalid-body"); return phoneError(req,"invalid-body"); }
  char body[769]; int received=0;
  while(received<req->content_len) { int count=httpd_req_recv(req,body+received,req->content_len-received); if(count<=0) { if(phoneAuthenticated(req)) forceStop("phone-body-timeout"); return ESP_FAIL; } received+=count; }
  body[received]=0; JsonDocument doc;
  if(deserializeJson(doc,body)||!doc.is<JsonObject>()) { if(phoneAuthenticated(req)) forceStop("phone-invalid-json"); return phoneError(req,"invalid-json"); }
  if(strcmp(req->uri,"/phone/session")==0) {
    if(uint32_t(millis()-pairWindow)>60000) { pairWindow=millis(); pairAttempts=0; }
    if(++pairAttempts>10) return phoneError(req,"pair-rate-limit","429 Too Many Requests");
    if(!colon::phoneKeyMatches(phoneHeader(req,"X-Colon-Pair").c_str(),PHONE_PAIR_CODE)) return phoneError(req,"pair-denied","403 Forbidden");
    if(!doc["protocol"].is<int>()||doc["protocol"].as<int>()!=1) return phoneError(req,"protocol-mismatch");
    uint32_t now=millis(); portENTER_CRITICAL(&motorMux); motor.tick(now); bool occupied=motor.connected; portEXIT_CRITICAL(&motorMux);
    if(occupied) return phoneError(req,"controller-already-connected","409 Conflict");
    randomHex(sessionToken,16); portENTER_CRITICAL(&motorMux); motor.connect(now); portEXIT_CRITICAL(&motorMux);
    JsonDocument reply; reply["token"]=sessionToken; statusJson(reply["status"].to<JsonObject>()); return phoneJson(req,reply);
  }
  if(!phoneAuthenticated(req)) return phoneError(req,"session-denied","403 Forbidden");
  if(strcmp(req->uri,"/phone/disconnect")==0) { forceStop("phone-disconnected",true); sessionToken[0]=0; }
  else if(strcmp(req->uri,"/phone/display")==0) {
    portENTER_CRITICAL(&motorMux); bool driving=motor.armed||motor.active; portEXIT_CRITICAL(&motorMux);
    if(driving) return phoneError(req,"stop-before-display","409 Conflict");
    if(!doc["emotion"].is<const char*>()) return phoneError(req,"invalid-emotion");
    String emotion=doc["emotion"].as<String>();
    if(emotion!="NORMAL"&&emotion!="JOY"&&emotion!="SURPRISE"&&emotion!="SAD"&&emotion!="SLEEPY"&&emotion!="THINKING") return phoneError(req,"invalid-emotion");
    phoneDrawEmotion(emotion);
  } else {
    colon::Command command;
    if(!parseCommand(doc,command)||(strcmp(req->uri,"/phone/stop")==0&&command.type!=colon::Action::Stop&&command.type!=colon::Action::Estop)) {
      forceStop("phone-invalid-command"); return phoneError(req,"invalid-command");
    }
    uint32_t now=millis(); portENTER_CRITICAL(&motorMux); const char* error=motor.command(command,now); portEXIT_CRITICAL(&motorMux);
    if(error) return phoneError(req,error);
  }
  JsonDocument reply; statusJson(reply.to<JsonObject>()); return phoneJson(req,reply);
}
esp_err_t phoneHealth(httpd_req_t* req) {
  httpd_resp_set_type(req,"text/plain; charset=utf-8"); httpd_resp_set_hdr(req,"Cache-Control","no-store");
  return httpd_resp_sendstr(req,"Colon AtomS3 HTTPS ready. Open the Colon phone app to connect.");
}
void startPhoneNetwork() {
  displayReady=phoneDisplay.init(); if(displayReady) { phoneDisplay.setBrightness(128); phoneDisplay.fillScreen(0); phoneDisplay.setTextColor(0xffff); phoneDisplay.setTextSize(1); phoneDisplay.println("Colon: Wi-Fi..."); }
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(PHONE_WIFI_SSID,PHONE_WIFI_PASSWORD);
  uint32_t began=millis(); while(WiFi.status()!=WL_CONNECTED&&uint32_t(millis()-began)<20000) delay(50);
  if(WiFi.status()!=WL_CONNECTED) { forceStop("phone-wifi-failed",true); Serial.println("Phone Wi-Fi unavailable; outputs stopped."); if(displayReady) phoneDisplay.println("Wi-Fi failed"); return; }
  MDNS.begin("colon-atom"); MDNS.addService("https","tcp",443);
  httpd_ssl_config_t cfg=HTTPD_SSL_CONFIG_DEFAULT();
  cfg.servercert=reinterpret_cast<const uint8_t*>(PHONE_TLS_CERT); cfg.servercert_len=strlen(PHONE_TLS_CERT)+1;
  cfg.prvtkey_pem=reinterpret_cast<const uint8_t*>(PHONE_TLS_KEY); cfg.prvtkey_len=strlen(PHONE_TLS_KEY)+1;
  cfg.httpd.max_uri_handlers=12; cfg.httpd.max_resp_headers=12; cfg.httpd.max_open_sockets=3;
  cfg.httpd.recv_wait_timeout=1; cfg.httpd.send_wait_timeout=1; cfg.tls_handshake_timeout_ms=4000;
  if(httpd_ssl_start(&phoneServer,&cfg)!=ESP_OK) { forceStop("phone-tls-failed",true); Serial.println("Phone TLS start failed; outputs stopped."); return; }
  const char* routes[]={"/phone/session","/phone/command","/phone/stop","/phone/disconnect","/phone/display"};
  for(auto route:routes) for(auto method:{HTTP_POST,HTTP_OPTIONS}) { httpd_uri_t uri={}; uri.uri=route; uri.method=method; uri.handler=phoneRequest; if(httpd_register_uri_handler(phoneServer,&uri)!=ESP_OK) forceStop("phone-route-failed",true); }
  httpd_uri_t health={}; health.uri="/"; health.method=HTTP_GET; health.handler=phoneHealth; httpd_register_uri_handler(phoneServer,&health);
  if(displayReady) { phoneDisplay.fillScreen(0); phoneDisplay.setCursor(0,0); phoneDisplay.println("Colon HTTPS ready"); phoneDisplay.println("colon-atom.local"); phoneDisplay.println(WiFi.localIP()); phoneDisplay.println("Pair code:"); phoneDisplay.println(PHONE_PAIR_CODE); }
  Serial.println("Phone HTTPS ready: https://colon-atom.local (credentials omitted)");
}
void phoneLoop() {
  if(WiFi.status()!=WL_CONNECTED) { portENTER_CRITICAL(&motorMux); bool connected=motor.connected; portEXIT_CRITICAL(&motorMux); if(connected) forceStop("phone-wifi-lost",true); }
}
