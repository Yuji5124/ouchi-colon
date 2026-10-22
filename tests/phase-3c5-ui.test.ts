import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';

test('debug UI keeps controls behind debug mode and exposes safe quick diagnostics', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="debug"[^>]*hidden/);
  assert.match(html, /id="quick-actions"/);
  assert.match(html, /id="diagnostic-copy"/);
  assert.match(html, /TOHOKU Happy（優先・未準備）/);
  assert.match(html, /id="recognition-start"/);
  assert.match(html, /id="camera-start"/);
  assert.match(html, /summary>音声・システムの詳細診断/);
});

test('PWA manifest declares face-derived install icons at supported sizes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')) as {
    icons: Array<{ src: string; sizes: string; type: string }>;
  };
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    const path = new URL(`../public/${icon.src.split('/').slice(2).join('/')}`, import.meta.url);
    const bytes = await readFile(path);
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.ok((await stat(path)).size > 1000);
  }
});
