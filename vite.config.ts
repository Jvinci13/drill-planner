import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The drill library lives in the browser's IndexedDB, which is scoped to the
// origin (host + port). Pin the port for both dev and preview so the library
// is always found at the same address.
export default defineConfig({
  plugins: [react()],
  // Polling: native file events were being missed on this machine, leaving
  // stale modules in the dev server after edits.
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
  preview: { port: 5173, strictPort: true },
});
