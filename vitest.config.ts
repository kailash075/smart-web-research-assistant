import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // Provides an in-memory fake `browser` API plus WXT's aliases and env vars.
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    restoreMocks: true,
  },
});
