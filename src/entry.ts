// Motor Test is isolated: ordinary face / conversation startup is unchanged.
if(new URLSearchParams(location.search).get('motor')==='1'){
  void import('./motor/screen').then(({mountMotorTest})=>mountMotorTest());
}else{
  void import('./main').then(()=>import('./motor/colon-link-screen')).then(({mountColonMotorLink})=>mountColonMotorLink());
}
