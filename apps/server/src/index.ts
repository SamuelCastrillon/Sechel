// Runtime-agnostic Web Standard entry (CF Workers + Vercel). The Node.js
// production server entry lives in src/entry-node.ts.
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createSechelServer } from '@sechel-mcp/mcp-server';
import type { CortexDB } from '@sechel-mcp/core';
import { createDb, verifyToken } from '@sechel-mcp/core';
import { registerAdminRoutes } from './admin.js';
import type { AdminRoutesOptions } from './admin.js';
import { seedAdminFromDb } from './admin/seed.js';
import { apiIconBytes, API_ICON_CONTENT_TYPE } from './assets/api-icon.js';

export { seedAdminFromDb };

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
export function createApp(opts?: {
  /** Shared Kysely instance (reused across all routes) */
  db?: Kysely<CortexDB>;
  /** Mount prefix for admin routes (e.g. "/api/admin"). Defaults to "/admin" */
  prefix?: string;
  /** Override JWT secret (defaults to process.env.JWT_SECRET) */
  jwtSecret?: string;
}): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // ---- API favicon ---------------------------------------------------------
  // Browsers request /favicon.ico automatically; /icon.png is a stable alias
  // for manual <link rel="icon"> usage. Works on Node, CF Workers and Vercel
  // because the image is embedded (no asset pipeline, no fs access).
  const iconHeaders = {
    'Content-Type': API_ICON_CONTENT_TYPE,
    'Cache-Control': 'public, max-age=86400',
  } as const;
  app.get('/favicon.ico', (c) => c.body(apiIconBytes().buffer as ArrayBuffer, 200, iconHeaders));
  app.get('/icon.png', (c) => c.body(apiIconBytes().buffer as ArrayBuffer, 200, iconHeaders));

  // ---- Admin maintenance routes ------------------------------------------
  registerAdminRoutes(app, opts as AdminRoutesOptions);

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
