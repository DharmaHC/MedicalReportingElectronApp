import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: 'assets',  // Serve assets folder as static files
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
  server: {
    port: 5173,
    host: 'localhost',
    strictPort: true,
    proxy: {
      // Proxy per API Aster (test) - DEVE essere prima di prod per evitare match errato
      '/proxy-test': {
        target: 'https://medicalreportingapitest.asterdiagnostica.it',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-test/, '/api'),
        secure: false
      },
      // Proxy per API Aster (produzione)
      '/proxy-prod': {
        target: 'https://medicalreportingapi.asterdiagnostica.it',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-prod/, '/api'),
        secure: false,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[PROXY] Forwarding:', req.method, req.url, '-> ', options.target + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[PROXY] Response:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err, req, res) => {
            console.error('[PROXY] Error:', err.message);
          });
        }
      }
    }
  },
    build: {
    outDir: path.resolve(process.cwd(), 'renderer-dist/renderer'),
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(process.cwd(), 'src/renderer/index.html')
    }
  }
})
