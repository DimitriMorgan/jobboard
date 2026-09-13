import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': `http://localhost:${process.env.PORT || 3000}` }, fs: { allow: [path.join(root, '..')] } },
});
