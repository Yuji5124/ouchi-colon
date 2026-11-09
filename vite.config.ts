import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local';

export default defineConfig({
  base: '/ouchi-colon/',
  // The official single-file browser build already includes its dependencies.
  // Serve it directly: late pre-bundling can invalidate a loaded USB screen.
  optimizeDeps: { exclude: ['esptool-js/bundle.js'] },
  define: {
    __APP_VERSION__: JSON.stringify(packageInfo.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  build: { target: 'es2020' },
});
