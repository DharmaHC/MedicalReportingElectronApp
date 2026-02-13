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
        'electron', 'child_process', 'fs', 'path', 'os', 'net', 'http', 'https', 'events', 'stream', 'url', 'util', 'zlib', 'crypto', 'tls',
        'pkcs11js', 'asn1js', 'pkijs', 'electron-log', 'electron-updater',
        'soap', 'formidable'
      ],
      output: { entryFileNames: 'index.js' }
    }
  }
});
