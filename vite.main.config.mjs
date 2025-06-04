import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [viteStaticCopy({ targets: [{ src: 'src/renderer/assets/**/*', dest: 'assets' }] })],
  build: {
    /* dove Electron-Forge si aspetta il bundle */
    outDir: 'renderer-dist',
    emptyOutDir: true,
    target: 'node20',

    /* debug più affidabile */
    sourcemap: 'inline',
    minify: false,

    lib: { entry: path.resolve('src/main/index.ts'), formats: ['cjs'] },
    rollupOptions: {
      external: ['electron', 'child_process', 'fs', 'path', 'pkcs11js', 'asn1js', 'pkijs', 'crypto', 'electron-log', 'electron-updater'],
      output: { entryFileNames: 'main.js' }
    }
  }
});
