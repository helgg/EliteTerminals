import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// In dev, Vite serves the UI on :5173 and proxies the WebSocket to the local server.
export default defineConfig({
  plugins: [svelte()],
  define: { __ET_VERSION__: JSON.stringify(version) },
  server: {
    proxy: { '/ws': { target: 'ws://localhost:8420', ws: true }, '/api': 'http://localhost:8420' },
  },
});
