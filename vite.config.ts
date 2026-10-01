import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base, damit der Build auch unter einem Unterpfad (z. B. GitHub Pages) funktioniert.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
