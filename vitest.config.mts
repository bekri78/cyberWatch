import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The frontend owns its browser-like test environment and dependencies;
    // the root command validates backend tests only.
    include: ['tests/**/*.test.ts'],
  },
});
