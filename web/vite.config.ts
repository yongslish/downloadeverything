import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Output goes into ../public so Express (server.mjs) can serve the built SPA
// alongside the retired /legacy/ downloader UI. emptyOutDir is false so that
// public/legacy/ is not wiped by each build.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(here, '../public'),
    emptyOutDir: false,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3030',
      '/legacy': 'http://127.0.0.1:3030',
    },
  },
});
