import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local';

export default defineConfig({
  base: '/ouchi-colon/',
  define: {
    __APP_VERSION__: JSON.stringify(packageInfo.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  build: { target: 'es2020', rollupOptions: { input: { index: fileURLToPath(new URL('./index.html', import.meta.url)), phone: fileURLToPath(new URL('./phone.html', import.meta.url)), motor: fileURLToPath(new URL('./motor-test.html', import.meta.url)) } } },
});
