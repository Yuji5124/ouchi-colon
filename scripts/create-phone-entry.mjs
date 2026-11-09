import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('index.html',root),'utf8');
writeFileSync(new URL('phone.html',root),source.replace('href="/manifest.webmanifest"','href="/manifest-phone.webmanifest"').replace('<title>OuchiColon</title>','<title>Colon iPhone</title>'));
