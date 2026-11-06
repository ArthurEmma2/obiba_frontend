import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: ['tests/**/*.node.test.ts'] } },
      { extends: true, test: { name: 'dom', environment: 'jsdom', include: ['tests/**/*.dom.test.{ts,tsx}'] } },
    ],
  },
});
