import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { gitApiPlugin } from './scripts/vite-git-api.mjs';

export default defineConfig({
  plugins: [react(), gitApiPlugin()],
  server: {
    host: '0.0.0.0',
  },
});
