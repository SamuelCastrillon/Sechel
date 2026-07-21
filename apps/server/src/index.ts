import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createSechelServer } from '@sechel-mcp/mcp-server';
import { createDb, verifyToken } from '@sechel-mcp/core';
import { registerAdminRoutes, bootstrapAdmin } from './admin.js';

// ---------------------------------------------------------------------------
// Env — typed bindings for both CF Workers and Node.js
// ---------------------------------------------------------------------------
export type Env = {
  DATABASE_URL?: string;
  DATABASE_AUTH_TOKEN?: string;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  TENANT_ID?: string;
  PORT?: string;
  SECHEL_DEV_TOKEN?: string;
};

function isVercel(): boolean {
  return process.env.VERCEL === '1';
}
function dbUrl(env: Partial<Env>): string {
  return env?.DATABASE_URL ?? env?.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? '';
}
function dbAuthToken(env: Partial<Env>): string | undefined {
  return env?.DATABASE_AUTH_TOKEN ?? env?.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
}
function dbRuntime(_env: Partial<Env>): 'edge' | 'node' {
  return isVercel() ? 'edge' : 'node';
}

// ---------------------------------------------------------------------------
// App factory — exported so tests and consumers can create isolated instances
// ---------------------------------------------------------------------------
export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

    // ---- Admin maintenance routes ------------------------------------------
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
      url: dbUrl(env),
      authToken: dbAuthToken(env),
      runtime: dbRuntime(env),
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
  // Seed admin on startup for long-running Node.js deployments (Docker/VPS).
  // In serverless (Vercel/CF Workers), seeding happens lazily via login.
  bootstrapAdmin().catch((err) =>
    console.error('bootstrapAdmin failed:', err instanceof Error ? err.message : err)
  );

  const port = parseInt(process.env.PORT || '3001', 10);
  console.log(`Sechel server starting on http://localhost:${port}`);
  console.log(`  MCP endpoint: POST /mcp`);
  console.log(`  Admin:        GET /admin/health`);

  serve({
    fetch: app.fetch,
    port,
  });
}
