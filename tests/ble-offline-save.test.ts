import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bundleReferences,cacheScreenResources} from '../src/robot/offline-save.ts';
test('offline collection follows local entry, module imports and CSS images without external hosts or duplicate loops',async()=>{
  const origin='https://example.test/ouchi-colon/';
  const files:Record<string,string>={
    'phone.html':'<script src="/ouchi-colon/assets/main.js"></script><link href="/ouchi-colon/assets/main.css">',
    'assets/main.js':'import "./shared.js";import("./shared.js");import "https://external.test/no.js";',
    'assets/shared.js':'export const a=1;','assets/main.css':'body{background:url("./face.png")}','assets/face.png':'image',
  };
  const stored:string[]=[];let calls=0;
  const cache={async put(key:RequestInfo|URL,_value:Response){stored.push(String(key));}};
  const count=await cacheScreenResources([origin+'phone.html'],cache,async input=>{calls++;const key=String(input).slice(origin.length);return files[key]===undefined?new Response('',{status:404}):new Response(files[key]);});
  assert.equal(count,5);assert.equal(calls,5);assert.equal(new Set(stored).size,5);assert.ok(stored.every(url=>url.startsWith(origin)));
  assert.deepEqual(bundleReferences('import "https://external.test/x.js"','https://example.test/a.js'),[]);
});
test('offline storage never reports success when a required resource fails',async()=>{
  await assert.rejects(()=>cacheScreenResources(['https://example.test/phone.html'],{async put(){}},async()=>new Response('',{status:404})),/保存できません/);
});
