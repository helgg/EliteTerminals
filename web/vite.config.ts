import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// In dev, Vite serves the UI on :5173 and proxies the WebSocket to the local server.
export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: { '/ws': { target: 'ws://localhost:8420', ws: true }, '/api': 'http://localhost:8420' },
  },
});
