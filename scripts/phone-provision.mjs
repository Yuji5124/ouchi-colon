import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const test=process.argv.includes('--test');
const directory=resolve(root,test?'.phone-build/test-private':'.phone-private'); mkdirSync(directory,{recursive:true});
const configPath=resolve(directory,'settings.json');
const createdSettings=!existsSync(configPath);
if(createdSettings) writeFileSync(configPath,JSON.stringify({ssid:test?'COMPILE-TEST-NOT-A-REAL-NETWORK':'',password:test?'COMPILE-TEST-ONLY':'',appOrigin:'https://yuji5124.github.io',pairCode:randomBytes(16).toString('hex')},null,2));
const settings=JSON.parse(readFileSync(configPath,'utf8'));
if(!settings.ssid) {
  if(!createdSettings) throw new Error('Wi-Fi設定が空です。.phone-private/settings.json のssid/passwordをPC上で入力してください。古い設定でのビルドは行いません。');
  console.log('Wi-Fi設定テンプレートを作成しました。.phone-private/settings.json にWi-Fi名とパスワードを入力し、再実行してください。チャットやGitHubへ送らないでください。');process.exit(0);
}
if(typeof settings.ssid!=='string'||Buffer.byteLength(settings.ssid)>32||/[\u0000-\u001f\u007f]/.test(settings.ssid)
  ||typeof settings.password!=='string'||Buffer.byteLength(settings.password)>63||/[\u0000-\u001f\u007f]/.test(settings.password)
  ||(settings.password.length>0&&Buffer.byteLength(settings.password)<8)||!/^[0-9a-f]{32}$/.test(settings.pairCode)) throw new Error('Invalid local configuration: SSID/password length or control characters (values omitted)');
const origin=new URL(settings.appOrigin); if(origin.protocol!=='https:'||origin.origin!==settings.appOrigin||origin.username||origin.password) throw new Error('appOrigin must be an HTTPS origin without a path');
const openssl=[process.env.OPENSSL,'C:/Program Files/Git/usr/bin/openssl.exe'].find(p=>p&&existsSync(p))||'openssl';
function run(args) {const result=spawnSync(openssl,args,{cwd:directory,encoding:'utf8'});if(result.status!==0)throw new Error('OpenSSL failed; check local installation. Secret data not printed.');}
const ca=resolve(directory,'colon-root.pem'), caKey=resolve(directory,'colon-root.key'), cert=resolve(directory,'atom-cert.pem'), key=resolve(directory,'atom.key');
if(!existsSync(ca)) {
  if(existsSync(caKey)) throw new Error('Existing CA key found without certificate; do not overwrite it');
  run(['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-days','3650','-keyout',caKey,'-out',ca,'-subj','/CN=Colon Local Device Root','-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign']);
}
if(!existsSync(cert)) {
  if(existsSync(key)) throw new Error('Existing device key found without certificate; do not overwrite it');
  const csr=resolve(directory,'atom.csr'), ext=resolve(directory,'atom.ext');
  writeFileSync(ext,'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:colon-atom.local\n');
  run(['req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-keyout',key,'-out',csr,'-subj','/CN=colon-atom.local']);
  run(['x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,'-CAcreateserial','-out',cert,'-days','365','-sha256','-extfile',ext]);
}
run(['verify','-CAfile',ca,'-purpose','sslserver','-verify_hostname','colon-atom.local',cert]);
run(['x509','-in',ca,'-outform','DER','-out',resolve(directory,'Colon-Local-Root.cer')]);
const header=Object.entries({PHONE_WIFI_SSID:settings.ssid,PHONE_WIFI_PASSWORD:settings.password,PHONE_APP_ORIGIN:settings.appOrigin,PHONE_PAIR_CODE:settings.pairCode,PHONE_TLS_CERT:readFileSync(cert,'utf8'),PHONE_TLS_KEY:readFileSync(key,'utf8')}).map(([name,value])=>`static const char ${name}[]=${JSON.stringify(value)};`).join('\n');
const output=resolve(root,test?'.phone-build/test-generated':'.phone-build/generated');mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'PhoneConfig.h'),'#pragma once\n'+header+'\n');
if(!test)copyFileSync(resolve(directory,'Colon-Local-Root.cer'),resolve(directory,'Install-on-iPhone.cer'));
console.log(test?'Prepared isolated compile-test credentials; no real Wi-Fi connection or device action.':'Prepared phone firmware configuration. Install only .phone-private/Install-on-iPhone.cer on iPhone; keep all private keys/settings on this PC.');
