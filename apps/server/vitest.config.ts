import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@sechel-mcp/core': new URL('../../packages/core/src', import.meta.url).pathname,
      '@sechel/mcp-server': new URL('../../packages/mcp-server/src', import.meta.url).pathname,
    },
  },
});
