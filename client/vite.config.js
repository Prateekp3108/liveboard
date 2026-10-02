import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_WS_URL || 'ws://localhost:5000',
        ws: true,
      },
      '/healthz': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
      },
      '/metrics': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
