import { defineConfig, normalizePath } from 'vite'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
// Scope private directories to this checkout, including releases inside .deploy.
const root = normalizePath(fileURLToPath(new URL('.', import.meta.url))).replace(/\/$/, '')
const privatePaths = ['.git', 'data', '.deploy', '.dev-data', 'config', 'server', 'tests', 'scripts'].map(dir => `${root}/${dir}/**`)
export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: true,
    // Polling avoids Windows EBUSY errors while Git or an editor replaces files.
    watch: { usePolling: true, interval: 300, ignored: [...privatePaths, '**/.gitattributes', '**/.gitignore'] },
    fs: { strict: true, allow: [root], deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git', ...privatePaths] }
  },
  build: { outDir: 'dist' }
})
