import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // 'node' keeps the suite dependency-free for the current pure-logic tests
    // (store, helpers). Component tests that need a DOM should install jsdom and
    // opt in per-file with `// @vitest-environment jsdom`.
    environment: 'node',
    passWithNoTests: true,
  },
});
