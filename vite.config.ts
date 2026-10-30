import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP: ffmpeg.wasm çok çekirdekli (SharedArrayBuffer) çalışması için gerekli.
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    headers: crossOriginHeaders,
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: crossOriginHeaders,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
