import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('home-screen entry uses the phone manifest and returns to phone mode',()=>{
  const root=new URL('../',import.meta.url);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('scripts/create-phone-entry.mjs',root))],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const html=readFileSync(new URL('phone.html',root),'utf8');
  assert.match(html,/href="\/manifest-phone.webmanifest"/);
  const manifest=JSON.parse(readFileSync(new URL('public/manifest-phone.webmanifest',root),'utf8'));
  assert.equal(manifest.start_url,'/ouchi-colon/phone.html');assert.equal(manifest.scope,'/ouchi-colon/');
  assert.match(html,/id="recognition-start"/);assert.match(html,/src="\/src\/main.ts"/);
});
