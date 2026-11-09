import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const html = resolve(dist, 'motor-test.html');
if (!existsSync(html)) throw new Error('Run npm run build first.');
const files = [html];
const visited = new Set(files);
for (let index = 0; index < files.length; index++) {
  const path = files[index], text = readFileSync(path, 'utf8');
  const references = [];
  if (extname(path) === '.html') {
    for (const match of text.matchAll(/(?:src|href)="(\/ouchi-colon\/assets\/[^"?#]+)"/g)) references.push(resolve(dist, match[1].slice('/ouchi-colon/'.length)));
  } else if (extname(path) === '.js') {
    for (const match of text.matchAll(/(?:from\s*|import\s*|import\s*\(\s*)["'](\.\/[^"']+\.js)["']/g)) references.push(resolve(dirname(path), match[1]));
  }
  for (const dependency of references) {
    if (!dependency.startsWith(dist + '/') && !dependency.startsWith(dist + '\\')) throw new Error('Invalid asset path.');
    if (!visited.has(dependency)) { visited.add(dependency); files.push(dependency); }
  }
}
let total = 0;
const assets = files.map((path, index) => {
  const bytes = gzipSync(readFileSync(path), { level: 9 }); total += bytes.length;
  const relative = path.slice(dist.length + 1).replaceAll('\\', '/');
  const mime = extname(path) === '.html' ? 'text/html; charset=utf-8' : extname(path) === '.css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
  const data = Array.from(bytes, v => '0x' + v.toString(16).padStart(2, '0')).join(',');
  return { index, path: '/ouchi-colon/' + relative, mime, size: bytes.length, declaration: `static const uint8_t web_${index}[] PROGMEM={${data}};` };
});
if (total > 180000) throw new Error('Motor-only web bundle unexpectedly large; do not include the conversation bundle.');
const header = '#pragma once\n#include <Arduino.h>\nstruct WebAsset { const char* path; const char* mime; const uint8_t* data; size_t length; };\n'
  + assets.map(a => a.declaration).join('\n') + '\nstatic const WebAsset WEB_ASSETS[]={\n'
  + assets.map(a => `{${JSON.stringify(a.path)},${JSON.stringify(a.mime)},web_${a.index},${a.size}}`).join(',\n')
  + '\n};\nstatic const size_t WEB_ASSET_COUNT=sizeof(WEB_ASSETS)/sizeof(WEB_ASSETS[0]);\n';
const output = resolve(root, 'firmware/ColonAtomS3MotorTest/generated'); mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'WebAssets.h'), header);
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({ gzipBytes: total, assets: assets.map(({ path, mime, size }) => ({ path, mime, size })) }, null, 2));
console.log(`Packaged ${assets.length} motor-only assets: ${total} gzip bytes. No firmware uploaded.`);
