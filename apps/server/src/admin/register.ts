import type { Hono } from 'hono';
import { sql } from 'kysely';
import type { Env } from '../index.js';
import { hashPassword } from './auth.js';
import { getDb } from './auth-middleware.js';

/**
 * Minimum password length for self-service registration.
 * Chosen to match the admin user-creation route (no explicit minimum there,
 * so 8 chars is a reasonable baseline for public signup).
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Whether the given setting value enables registration.
 * Accepts '1' or 'true' (case-insensitive); anything else is disabled.
 */
export function isRegistrationEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * Register the public registration routes on the given Hono router.
 *
 * Routes (both must be listed in authMiddleware EXEMPT_PATHS so they are
 * reachable without a session):
 *   POST /auth/register               — self-service account registration
 *   GET  /public/registration-enabled — public registration toggle check
 *
 * The router is the admin router mounted under the configured prefix. Both
 * routes are exempt from JWT auth, so no user is set in context and the
 * admin-only `requireRole` middleware (registered later) skips them.
 */
export function registerRegisterRoutes(router: Hono): void {
  // POST /auth/register — create a pending (is_active = 0) member account.
  // Does NOT auto-login and does NOT set a session cookie.
  router.post('/auth/register', async (c) => {
    const db = getDb(c);
    const env = c.env as Partial<Env>;
    const tenantId = env?.TENANT_ID ?? process.env.TENANT_ID ?? 'default';

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

    if (password.length < MIN_PASSWORD_LENGTH) {
      return c.json(
        { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        400,
      );
    }

    // Registration must be explicitly enabled for this instance.
    const reg = await sql<{ value: string }>`
      SELECT value FROM instance_settings WHERE key = 'registration_enabled'
    `.execute(db);
    if (!isRegistrationEnabled(reg.rows[0]?.value)) {
      return c.json({ error: 'Registration is disabled' }, 403);
    }

    // Username uniqueness within the tenant.
    const existing = await sql<{ id: number }>`
      SELECT id FROM users WHERE tenant_id = ${tenantId} AND username = ${username}
    `.execute(db);
    if (existing.rows.length > 0) {
      return c.json({ error: 'Username already exists' }, 409);
    }

    const hash = await hashPassword(password);

    await sql`
      INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
      VALUES (${tenantId}, ${username}, 'member', ${hash}, 0, datetime('now'))
    `.execute(db);

    const created = await sql<{ id: number; username: string; role: string; is_active: number }>`
      SELECT id, username, role, is_active FROM users
      WHERE tenant_id = ${tenantId} AND username = ${username}
    `.execute(db);

    return c.json({ ...created.rows[0] }, 201);
  });

  // GET /public/registration-enabled — public toggle check (no auth).
  router.get('/public/registration-enabled', async (c) => {
    const db = getDb(c);
    const reg = await sql<{ value: string }>`
      SELECT value FROM instance_settings WHERE key = 'registration_enabled'
    `.execute(db);
    return c.json({ enabled: isRegistrationEnabled(reg.rows[0]?.value) });
  });
}
