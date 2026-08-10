import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Never silently skip tests via .only — the server suite is large.
    allowOnly: false,
    // argon2 (64 MB, t=3) dominates beforeAll seeding and change-password
    // flows; 4 files run in parallel workers, so the default 10 s hook /
    // test timeouts flake on loaded machines.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@sechel-mcp/core': new URL('../../packages/core/src', import.meta.url).pathname,
      '@sechel-mcp/mcp-server': new URL('../../packages/mcp-server/src', import.meta.url).pathname,
    },
  },
});
