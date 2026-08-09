import { Hono } from 'hono';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import type { Env } from './index.js';
import { seedAdmin } from './admin/seed.js';
import {
  createSessionToken,
  generateRefreshToken,
  hashPassword,
  verifyPassword,
  sessionCookieString,
  refreshCookieString,
  clearSessionCookieString,
  isSecureRequest,
} from './admin/auth.js';
import { authMiddleware, getDb, getUser } from './admin/auth-middleware.js';
import { MIN_PASSWORD_LENGTH, registerRegisterRoutes } from './admin/register.js';
import { registerUserRoutes } from './admin/users.js';
import { registerSettingsRoutes } from './admin/settings.js';
import { registerTokenRoutes } from './admin/tokens.js';
import { registerSessionRoutes } from './admin/sessions.js';
import { createRateLimiter, clientIp } from './admin/rate-limit.js';
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

  // Resolve the DB FIRST, so getDb(c) is available inside authMiddleware —
  // the per-request session check needs it (SR-1). Per-request connections
  // are destroyed in a finally that still wraps the whole handler chain.
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

  // Apply auth middleware to all admin routes (exempt paths handled internally)
  adminRouter.use('/*', authMiddleware(opts?.jwtSecret, prefix));

  // Login is public, so brute force must be throttled per IP + username.
  const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

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

      // Only enforce the limit once credentials are present — empty-body
      // probes cost nothing (no argon2), so they are not throttled.
      const limiterKey = `${clientIp(c)}:${username}`;
      if (!loginLimiter.allow(limiterKey)) {
        return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
      }

      // Env bindings are passed through from parent app at runtime
      const env = c.env as Partial<Env>;
      const tenantId = env?.TENANT_ID ?? process.env.TENANT_ID ?? 'default';
      // The db-setter middleware runs before this handler, so the DB is
      // already in context (and its lifecycle is managed by the middleware).
      const db = getDb(c);

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

      loginLimiter.reset(limiterKey);

      // Create one session row per device (AS-2): the row id becomes the
      // access JWT `sid` claim. Only the SHA-256 of the opaque refresh token
      // is stored — never the plaintext. expires_at = now + 30 days (RT-2).
      const sid = crypto.randomUUID();
      const lineageId = crypto.randomUUID();
      const { raw: rawRefresh, hash: refreshHash } = await generateRefreshToken();

      await sql`
        INSERT INTO auth_sessions (id, tenant_id, user_id, device_name, user_agent, ip, expires_at, refresh_hash, lineage_id)
        VALUES (${sid}, ${tenantId}, ${row.id}, 'web', ${c.req.header('User-Agent') ?? null}, ${clientIp(c)}, datetime('now', '+30 days'), ${refreshHash}, ${lineageId})
      `.execute(db);

      const sessionToken = await createSessionToken(
        { userId: row.id, tenantId, role: row.role, sid },
        opts?.jwtSecret,
      );

      // Set HttpOnly session + refresh cookies. Secure only on HTTPS
      // requests so local plain-HTTP dev keeps working.
      const secure = isSecureRequest(c);
      c.header('Set-Cookie', sessionCookieString(sessionToken, secure));
      c.header('Set-Cookie', refreshCookieString(rawRefresh, secure), { append: true });

      return c.json({
        token: sessionToken,
        refresh_token: rawRefresh,
        user: { id: row.id, username: row.username, role: row.role },
      });
    } catch (err) {
      // Log details server-side, never leak internals to the client.
      console.error('[admin/auth] login failed:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // ---- Auth logout (clears the session cookie) ----
  // Requires a valid session; the stateless JWT itself stays valid until
  // expiry (Bearer API clients are unaffected — they don't rely on cookies).
  adminRouter.post('/auth/logout', async (c) => {
    c.header('Set-Cookie', clearSessionCookieString(isSecureRequest(c)));
    return c.json({ success: true });
  });

  // ---- Auth change-password (session-authenticated) ----
  adminRouter.post('/auth/change-password', async (c) => {
    const user = getUser(c);
    const db = getDb(c);

    let currentPassword: string | undefined;
    let newPassword: string | undefined;
    try {
      const body = await c.req.json<{ current_password?: string; new_password?: string }>();
      currentPassword = body.current_password;
      newPassword = body.new_password;
    } catch {
      return c.json({ error: 'current_password and new_password are required' }, 400);
    }

    if (!currentPassword || !newPassword) {
      return c.json({ error: 'current_password and new_password are required' }, 400);
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return c.json(
        { error: `new password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        400,
      );
    }

    try {
      const row = await sql<{ credential_hash: string }>`
        SELECT credential_hash FROM users WHERE id = ${user.userId}
      `.execute(db);
      if (row.rows.length === 0) {
        return c.json({ error: 'Current password is incorrect' }, 401);
      }

      const valid = await verifyPassword(currentPassword, row.rows[0].credential_hash);
      if (!valid) {
        return c.json({ error: 'Current password is incorrect' }, 401);
      }

      const hash = await hashPassword(newPassword);
      await sql`
        UPDATE users SET credential_hash = ${hash} WHERE id = ${user.userId}
      `.execute(db);

      return c.json({ success: true });
    } catch (err) {
      console.error('[admin/auth] change-password failed:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // ---- Auth register + public settings (public, exempt from JWT) ----
  registerRegisterRoutes(adminRouter);

  // ---- Session refresh (exempt from JWT, authenticated via refresh cookie) ----
  registerSessionRoutes(adminRouter, opts?.jwtSecret);

  // ---- CRUD sub-routers ----
  registerUserRoutes(adminRouter);
  registerSettingsRoutes(adminRouter);
  registerTokenRoutes(adminRouter);

  // Mount the admin router at the configured prefix
  app.route(prefix, adminRouter);
}
