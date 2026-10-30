import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: true,
    // Polling avoids Windows EBUSY errors while Git or an editor replaces files.
    watch: { usePolling: true, interval: 300, ignored: ['**/.git/**', '**/.gitattributes', '**/.gitignore', '**/data/**', '**/.deploy/**', '**/.dev-data/**', '**/server/**', '**/tests/**', '**/scripts/**'] },
    fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**', '**/.deploy/**', '**/.dev-data/**', '**/config/**', '**/server/**', '**/tests/**', '**/scripts/**'] }
  },
  build: { outDir: 'dist' }
})
