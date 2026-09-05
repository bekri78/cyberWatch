import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages sert ce projet depuis https://<user>.github.io/cyberWatch/
  // (page de projet, meme repo que le backend) -- a changer si le frontend
  // est publie depuis un depot different.
  base: '/cyberWatch/',
  resolve: {
    // Alias shadcn/ui (@/... -> src/...), miroir de tsconfig.app.json.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
});
