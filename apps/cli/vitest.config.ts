import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    allowOnly: false,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@sechel-mcp/core': path.resolve(process.cwd(), '../../packages/core/src'),
      '@sechel-mcp/mcp-server': path.resolve(process.cwd(), '../../packages/mcp-server/src'),
    },
  },
});
