import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createSechelServer } from '@sechel-mcp/mcp-server';
import { createDb, verifyToken } from '@sechel-mcp/core';
import { registerAdminRoutes } from './admin.js';

// ---------------------------------------------------------------------------
// Env — typed bindings for both CF Workers and Node.js
// ---------------------------------------------------------------------------
export type Env = {
  DATABASE_URL: string;
  DATABASE_AUTH_TOKEN?: string;
  TENANT_ID?: string;
  PORT?: string;
  SECHEL_ADMIN_TOKEN?: string;
};

// ---------------------------------------------------------------------------
// App factory — exported so tests and consumers can create isolated instances
// ---------------------------------------------------------------------------
export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // ---- Admin routes -------------------------------------------------------
  registerAdminRoutes(app);

  // ---- MCP StreamableHTTP endpoint ----------------------------------------
  // Creates a fresh transport + server per request (stateless mode).
  // Suitable for both Node.js and edge runtimes (CF Workers, Deno, Bun).
  //
  // The WebStandardStreamableHTTPServerTransport accepts a Web Standard
  // Request and returns a Response, so it works natively with Hono.
  //
  // Optimisation opportunity: cache the DB connection and MCP server
  // across requests for warm-start performance in long-running processes.
  // -------------------------------------------------------------------------
  app.post('/mcp', async (c) => {
    const env = c.env;
    const authHeader = c.req.header('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    const db = await createDb({
      url: env?.DATABASE_URL ?? process.env.DATABASE_URL ?? '',
      authToken: env?.DATABASE_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN,
    });

    const authInfo = await verifyToken(
      bearerToken,
      db,
      env?.TENANT_ID ?? process.env.TENANT_ID ?? 'default',
      env?.SECHEL_DEV_TOKEN ?? process.env.SECHEL_DEV_TOKEN,
    );
    if (!authInfo) return c.json({ error: 'Unauthorized' }, 401);

    const transport = new WebStandardStreamableHTTPServerTransport();

    await createSechelServer({
      transport,
      db,
      tenantId: env?.TENANT_ID ?? process.env.TENANT_ID ?? 'default',
      auth: { required: true },
    });

    return transport.handleRequest(c.req.raw, { authInfo });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Global app instance — reused by serve() and CF Workers export
// ---------------------------------------------------------------------------
const app = createApp();

// ---- CF Workers entry point (when deployed to Cloudflare) -----------------
export default app;

// ---- Node.js entry point (when running directly) --------------------------
const isDirectRun =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(`/${process.argv[1]}`));

if (isDirectRun) {
  const port = parseInt(process.env.PORT || '3001', 10);
  console.log(`Sechel server starting on http://localhost:${port}`);
  console.log(`  MCP endpoint: POST /mcp`);
  console.log(`  Admin:        GET /admin/health`);

  serve({
    fetch: app.fetch,
    port,
  });
}
