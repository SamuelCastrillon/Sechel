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
      '@sechel/core': path.resolve(process.cwd(), '../core/src'),
      '@sechel/mcp-server': path.resolve(process.cwd(), '../mcp-server/src'),
    },
  },
});
