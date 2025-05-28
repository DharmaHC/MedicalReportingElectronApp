import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(process.cwd(), 'src/renderer') },
      { find: '@/components', replacement: path.resolve(process.cwd(), 'src/renderer/components') },
      { find: '@/store', replacement: path.resolve(process.cwd(), 'src/renderer/store') },
      { find: '@/pages', replacement: path.resolve(process.cwd(), 'src/renderer/pages') },
      { find: '@/utility', replacement: path.resolve(process.cwd(), 'src/renderer/utility') },
      { find: '@/assets', replacement: path.resolve(process.cwd(), 'src/renderer/assets') }
    ]
  },
  build: {
    outDir: path.resolve(process.cwd(), 'renderer-dist/renderer'),
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(process.cwd(), 'src/renderer/index.html')
    }
  }
})
