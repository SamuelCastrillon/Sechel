import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import type { Env } from './index.js';
import { seedAdmin } from './admin/seed.js';
import { createSessionToken, verifyPassword } from './admin/auth.js';
import { authMiddleware } from './admin/auth-middleware.js';
import { registerRegisterRoutes } from './admin/register.js';
import { registerUserRoutes } from './admin/users.js';
import { registerSettingsRoutes } from './admin/settings.js';
import { registerTokenRoutes } from './admin/tokens.js';
import { createDb } from '@sechel-mcp/core';

/**
 * Options for registerAdminRoutes.
 */
export interface AdminRoutesOptions {
  /** Shared Kysely instance to reuse across all admin handlers */
  db?: Kysely<CortexDB>;
  /** Mount prefix for admin routes (e.g. "/api/admin" or "/admin"). Defaults to "/admin" */
  prefix?: string;
  /** Override JWT secret (defaults to process.env.JWT_SECRET) */
  jwtSecret?: string;
}

/**
 * Bootstrap the admin user from ADMIN_USERNAME / ADMIN_PASSWORD env vars.
 * Idempotent — safe to call on every cold start.
 */
function dbUrl(): string {
  return process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? '';
}
function dbAuthToken(): string | undefined {
  return process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
}

export async function bootstrapAdmin(): Promise<void> {
  const url = dbUrl();
  const authToken = dbAuthToken();
  const tenantId = process.env.TENANT_ID ?? 'default';
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!url) return;

  if (adminUsername && adminPassword) {
    const { createClient } = process.env.VERCEL === '1'
      ? await import('@libsql/client/web')
      : await import('@libsql/client');
    const { runMigrations } = await import('@sechel-mcp/core');

    const client = createClient({ url, authToken });
    try {
      await runMigrations(client);
      await seedAdmin(client, tenantId, { username: adminUsername, password: adminPassword });
    } finally {
      client.close();
    }
  }
}

let seededPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seededPromise) {
    seededPromise = bootstrapAdmin().catch((err) => {
      seededPromise = null;
      throw err;
    });
  }
  return seededPromise;
}

/**
 * Resolve the DB connection for a request.
 *
 * If a shared Kysely instance was provided via opts, return that.
 * Otherwise, create a new connection from env vars (backward-compatible).
 */
async function getDbForRequest(
  env: Partial<Env>,
  sharedDb?: Kysely<CortexDB>,
): Promise<Kysely<CortexDB>> {
  if (sharedDb) return sharedDb;

  const url = env?.DATABASE_URL ?? env?.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? '';
  const authToken = env?.DATABASE_AUTH_TOKEN ?? env?.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('DATABASE_URL not configured');
  }

  return createDb({
    url,
    authToken,
    runtime: process.env.VERCEL === '1' ? 'edge' : 'node',
  });
}

/**
 * Register admin REST API routes on the Hono app.
 *
 * Applies JWT auth middleware to all admin routes except
 * /health and /auth/login. Mounts user, settings, and token
 * sub-routers under the configured prefix (default: /admin).
 *
 * If `opts.db` is provided, all admin handlers reuse the shared
 * Kysely instance. Otherwise, each handler creates a per-request
 * connection (backward-compatible).
 */
export function registerAdminRoutes(
  app: Hono<{ Bindings: Env }>,
  opts?: AdminRoutesOptions,
): void {
  const prefix = opts?.prefix ?? '/admin';

  // Internal router — uses process.env since it may be mounted on a sub-path
  // without direct access to parent Env bindings.
  // Variables accessed via typed helpers (getUser/getDb) that cast internally.
  const adminRouter = new Hono();

  // Apply auth middleware to all admin routes (exempt paths handled internally)
  adminRouter.use('/*', authMiddleware(opts?.jwtSecret));

  // If shared db provided, set it in context for all handlers.
  // Otherwise, create a per-request connection from env vars.
  if (opts?.db) {
    adminRouter.use('/*', async (c, next) => {
      (c as any).set('db', opts.db!);
      await next();
    });
  } else {
    adminRouter.use('/*', async (c, next) => {
      const db = await getDbForRequest(c.env as Partial<Env>);
      (c as any).set('db', db);
      try {
        await next();
      } finally {
        if (typeof (db as any)?.destroy === 'function') {
          await (db as any).destroy();
        }
      }
    });
  }

  // ---- Health check (always public) ----
  adminRouter.get('/health', async (c) => {
    return c.json({ status: 'ok', time: Date.now() });
  });

  // ---- Auth login (always public) ----
  adminRouter.post('/auth/login', async (c) => {
    await ensureSeeded();
    try {
      let username: string | undefined;
      let password: string | undefined;
      try {
        const body = await c.req.json<{ username?: string; password?: string }>();
        username = body.username;
        password = body.password;
      } catch {
        return c.json({ error: 'username and password are required' }, 400);
      }

      if (!username || !password) {
        return c.json({ error: 'username and password are required' }, 400);
      }

      // Env bindings are passed through from parent app at runtime
      const env = c.env as Partial<Env>;
      const tenantId = env?.TENANT_ID ?? process.env.TENANT_ID ?? 'default';
      const db = await getDbForRequest(env, opts?.db);

      try {
        const { sql } = await import('kysely');
        const user = await sql<{
          id: number; username: string; role: string; credential_hash: string; is_active: number
        }>`
          SELECT id, username, role, credential_hash, is_active
          FROM users
          WHERE tenant_id = ${tenantId} AND username = ${username}
          LIMIT 1
        `.execute(db);

        if (user.rows.length === 0) {
          return c.json({ error: 'Invalid credentials' }, 401);
        }

        const row = user.rows[0];
        const valid = await verifyPassword(password, row.credential_hash);

        if (!valid || !row.is_active) {
          return c.json({ error: 'Invalid credentials' }, 401);
        }

        const sessionToken = await createSessionToken(
          { userId: row.id, tenantId, role: row.role },
          opts?.jwtSecret,
        );

        // Set HttpOnly session cookie for standalone mode
        c.header('Set-Cookie', `session=${sessionToken}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);

        return c.json({
          token: sessionToken,
          user: { id: row.id, username: row.username, role: row.role },
        });
      } finally {
        if (!opts?.db) await db.destroy();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ error: message }, 500);
    }
  });

  // ---- Auth register + public settings (public, exempt from JWT) ----
  registerRegisterRoutes(adminRouter);

  // ---- CRUD sub-routers ----
  registerUserRoutes(adminRouter);
  registerSettingsRoutes(adminRouter);
  registerTokenRoutes(adminRouter);

  // Mount the admin router at the configured prefix
  app.route(prefix, adminRouter);
}
