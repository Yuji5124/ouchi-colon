import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cacheScreenResources} from '../src/robot/offline-save.ts';
import {FACE_ASSET_PATHS} from '../src/character/face-renderer.ts';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const base='https://colon-offline.test/ouchi-colon/';let bytes=0;const paths=[];
const initial=['phone.html','manifest-phone.webmanifest',...Object.values(FACE_ASSET_PATHS).map(p=>'assets/face/'+p)].map(p=>base+p);
const count=await cacheScreenResources(initial,{async put(key,response){paths.push(String(key));bytes+=(await response.arrayBuffer()).byteLength;}},async input=>{
  const url=new URL(String(input));
  if(!url.href.startsWith(base))throw new Error('External offline dependency');
  const file=resolve(dist,decodeURIComponent(url.pathname.slice('/ouchi-colon/'.length)));
  if(!file.startsWith(resolve(dist)+sep))throw new Error('Invalid resource path');
  try{return new Response(await readFile(file));}catch{return new Response('missing',{status:404});}
});
if(!paths.some(p=>/\/assets\/main-[^/]+\.js$/.test(p))||!paths.some(p=>/\/assets\/main-[^/]+\.css$/.test(p)))throw new Error('Main app bundle was not saved');
console.log(JSON.stringify({result:'PASS',resources:count,bytes,scope:'built screen and face assets; Bluefy runtime and voice models not verified'}));
