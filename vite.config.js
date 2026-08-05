import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // reachable from the other device on your LAN
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
