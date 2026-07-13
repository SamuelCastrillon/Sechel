import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createSechelServer } from '@sechel/mcp-server';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import path from 'node:path';
import { createDb } from '@sechel-mcp/core';
import { ensureConfigDir, loadConfig, getDefaultDbPath } from './config.js';

/**
 * Create a Hono app with health check and MCP endpoint.
 * Exported for testing — does NOT start the HTTP server.
 *
 * @param db - A connected Kysely database instance
 */
export function createApp(db: Kysely<CortexDB>): Hono {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // MCP Streamable HTTP endpoint
  app.post('/mcp', async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });

    await createSechelServer({
      transport,
      db,
      tenantId: 'default',
      auth: { required: false },
    });

    return transport.handleRequest(c.req.raw);
  });

  return app;
}

/**
 * Start HTTP mode: creates a local SQLite database and starts a Hono HTTP server.
 *
 * The server serves:
 *   - GET /health — health check
 *   - POST /mcp   — MCP Streamable HTTP endpoint
 */
export async function startHttp(): Promise<void> {
  await ensureConfigDir();
  const config = await loadConfig();
  const dbPath = config.dbPath ?? getDefaultDbPath();
  const db = await createDb({ url: `file:${path.resolve(dbPath)}` });

  const app = createApp(db);

  const port = config.port ?? 3030;
  const host = config.host ?? 'localhost';

  console.log(`  ✓ Sechel corriendo en http://${host}:${port}`);
  console.log(`  ✓ MCP endpoint: http://${host}:${port}/mcp`);
  console.log(`  ✓ DB: ${dbPath}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });
}
