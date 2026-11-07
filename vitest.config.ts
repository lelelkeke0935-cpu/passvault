import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so `npm test` does not pick up the panel root.
export default defineConfig({
  test: { root: '.', include: ['src/**/*.test.ts'], environment: 'node' },
});
