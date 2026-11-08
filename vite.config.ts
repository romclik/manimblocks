import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content-Security-Policy for the packaged app only (dev server needs inline scripts).
const csp: Plugin = {
  name: 'manimblocks-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html.replace(
        '</head>',
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: mbvideo:" /></head>`,
      ),
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), csp],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 3000 },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'electron/**/*.test.ts'], testTimeout: 30000 },
});
