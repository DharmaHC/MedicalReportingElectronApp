import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'renderer-dist/main',
    emptyOutDir: false,
    target: 'node20',
    sourcemap: 'inline',
    minify: false,
    lib: {
      entry: path.resolve('src/main/index.ts'),
      formats: ['cjs']
    },
    rollupOptions: {
      external: [
        'electron', 'child_process', 'fs', 'path', 'pkcs11js', 'asn1js', 'pkijs', 'crypto', 'electron-log', 'electron-updater'
      ],
      output: { entryFileNames: 'index.js' }
    }
  },
  // 👇 Indica a Vite quale tsconfig usare!
  esbuild: {
    tsconfig: 'tsconfig.main.json'
  }
});
