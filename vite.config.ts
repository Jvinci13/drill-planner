import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The drill library lives in the browser's IndexedDB, which is scoped to the
// origin (host + port). Pin the port for both dev and preview so the library
// is always found at the same address.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
