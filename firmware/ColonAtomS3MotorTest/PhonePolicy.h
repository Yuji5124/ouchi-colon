#pragma once
#include <string.h>
namespace colon {
inline bool phoneOriginAllowed(const char* origin,const char* allowed) { return origin&&allowed&&strlen(origin)>0&&strcmp(origin,allowed)==0; }
inline bool phoneRouteAllowed(const char* uri) {
  const char* routes[]={"/phone/session","/phone/command","/phone/stop","/phone/disconnect","/phone/display"};
  for(auto route:routes) { if(strcmp(uri,route)==0) return true; }
  return false;
}
inline bool phoneKeyMatches(const char* actual,const char* expected) {
  size_t a=strlen(actual),b=strlen(expected); if(a!=b||b<12||b>64) return false;
  unsigned difference=0; for(size_t i=0;i<b;i++) difference|=unsigned(actual[i]^expected[i]); return difference==0;
}
}
