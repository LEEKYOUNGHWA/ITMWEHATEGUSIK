import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: { allowedHosts: true, fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**', '**/config/**', '**/server/**', '**/tests/**', '**/scripts/**'] } },
  build: { outDir: 'dist' }
})
