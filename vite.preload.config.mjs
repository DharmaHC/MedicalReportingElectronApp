import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  build: {
    outDir: 'renderer-dist/preload',
    emptyOutDir: false,        // non cancellare main.js
    target: 'node20',
    sourcemap: 'inline',
    lib: {
      entry: path.resolve('preload/index.ts'),
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['electron', 'fs', 'path'],
      output: { entryFileNames: 'index.js', chunkFileNames: '[name].js' }
    }
  }
})
