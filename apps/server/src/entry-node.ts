// Node.js production entry. Not used on Vercel or Cloudflare Workers — those
// use the default export from index.ts.
import { serve } from '@hono/node-server';
import { createApp } from './index.js';
import { ensureSeeded } from './admin.js';

ensureSeeded().catch((err) =>
  console.error('bootstrapAdmin failed:', err instanceof Error ? err.message : err)
);

const port = parseInt(process.env.PORT || '3001', 10);
const app = createApp();

console.log(`Sechel server starting on http://localhost:${port}`);
console.log(`  MCP endpoint: POST /mcp`);
console.log(`  Admin:        GET /admin/health`);

serve({ fetch: app.fetch, port });
