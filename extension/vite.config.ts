import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  base: '',   // relative asset paths for chrome-extension://
  plugins: [react()],
  root: resolve(__dirname, 'src/sidebar'),
  resolve: {
    alias: {
      '@frontend': resolve(__dirname, '../app/frontend/src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/sidebar'),
    emptyOutDir: true,
  },
  css: {
    postcss: resolve(__dirname, 'postcss.config.js'),
  },
});
