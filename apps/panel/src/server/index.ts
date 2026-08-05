import { createApp as createSechelApp } from '@sechel/server';
import { createDb } from '@sechel-mcp/core';

/**
 * Environment the embedded server needs. The PANEL resolves this from its
 * own runtime (Astro handles env loading per target), so the embedded
 * @sechel/server never reads process.env itself.
 */
export interface EmbeddedAppEnv {
  DATABASE_URL?: string;
  DATABASE_AUTH_TOKEN?: string;
  JWT_SECRET?: string;
  TENANT_ID?: string;
}

// Derived from createDb's own return type to avoid a Kysely dual-package
// type mismatch (cjs vs esm) between direct imports and @sechel-mcp/core.
type EmbeddedDb = Awaited<ReturnType<typeof createDb>>;

export interface EmbeddedApp {
  app: ReturnType<typeof createSechelApp>;
  db: EmbeddedDb;
}

/**
 * Resolve the panel environment for the embedded server.
 *
 * - `override` is used on Cloudflare, where runtime bindings arrive via
 *   `locals.runtime.env` (see `embeddedEnvFromLocals`).
 * - Otherwise the env comes from `import.meta.env` (Astro loads `.env` there,
 *   covering local dev and Vercel) with a `process.env` fallback for built
 *   Node deployments (docker / `node dist/server/entry.mjs`).
 */
export function resolveEmbeddedEnv(override?: EmbeddedAppEnv): EmbeddedAppEnv {
  if (override !== undefined) {
    return override;
  }
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env ?? {};
  const proc = typeof process !== 'undefined' ? process.env : undefined;
  return {
    DATABASE_URL: meta.DATABASE_URL ?? proc?.DATABASE_URL,
    DATABASE_AUTH_TOKEN: meta.DATABASE_AUTH_TOKEN ?? proc?.DATABASE_AUTH_TOKEN,
    JWT_SECRET: meta.JWT_SECRET ?? proc?.JWT_SECRET,
    TENANT_ID: meta.TENANT_ID ?? proc?.TENANT_ID,
  };
}

/**
 * Extract the embedded server env from Astro `locals`. On the Cloudflare
 * adapter the runtime bindings live at `locals.runtime.env`; on the Node and
 * Vercel adapters `locals.runtime` is absent, so this returns `undefined` and
 * `resolveEmbeddedEnv` falls back to `import.meta.env` / `process.env`.
 */
export function embeddedEnvFromLocals(
  locals: Record<string, unknown>,
): EmbeddedAppEnv | undefined {
  const runtime = locals?.runtime as
    | { env?: Record<string, string | undefined> }
    | undefined;
  if (!runtime?.env) return undefined;
  return {
    DATABASE_URL: runtime.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: runtime.env.DATABASE_AUTH_TOKEN,
    JWT_SECRET: runtime.env.JWT_SECRET,
    TENANT_ID: runtime.env.TENANT_ID,
  };
}

/**
 * Build a fresh embedded app for the given environment: create the Kysely
 * instance (the PANEL owns the DB, so the embedded Hono app never reads
 * process.env) and mount the admin routes under /api/admin.
 *
 * `createDb` runs with the default 'auto' runtime: `file:`/`:memory:` URLs
 * use the Node driver, `libsql://`/`https://` use the Web (WASM/HTTP) driver,
 * which is safe on Vercel serverless and Cloudflare Workers.
 *
 * Note: `createApp` also mounts the /mcp route. The panel never calls /mcp;
 * that handler creates its own DB from process.env and would 500 if invoked
 * from the panel without DATABASE_URL in process.env — acceptable, the panel
 * only uses /api/admin.
 */
export async function createEmbeddedApp(env: EmbeddedAppEnv): Promise<EmbeddedApp> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the embedded server');
  }
  const db = await createDb({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });
  const app = createSechelApp({
    db,
    prefix: '/api/admin',
    jwtSecret: env.JWT_SECRET,
  });
  return { app, db };
}

// The panel's runtime env is fixed per deployment, so the app/db are built
// once and reused across requests (also avoids re-running migrations).
let cachedApp: EmbeddedApp | null = null;

/**
 * Get the shared embedded app, building it lazily from the env available at
 * request time (Cloudflare locals override, or the resolved panel env).
 */
export async function getEmbeddedApp(env?: EmbeddedAppEnv): Promise<EmbeddedApp> {
  if (!cachedApp) {
    cachedApp = await createEmbeddedApp(resolveEmbeddedEnv(env));
  }
  return cachedApp;
}

/**
 * Handle API requests by forwarding to the embedded @sechel/server.
 * Used by Astro endpoints to delegate /api/* to Hono.
 * The resolved env is passed through to Hono so route handlers can read
 * bindings (e.g. TENANT_ID) from `c.env`.
 */
export async function handleApiRequest(
  request: Request,
  env?: EmbeddedAppEnv,
): Promise<Response> {
  const { app } = await getEmbeddedApp(env);
  return app.fetch(request, resolveEmbeddedEnv(env));
}
