import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Electron loads the built index.html via file://, where absolute asset
  // paths (Vite's default) resolve against the filesystem root instead of
  // the dist folder and silently fail to load — relative paths fix that.
  base: './',
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src/renderer')
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0')
  }
})
