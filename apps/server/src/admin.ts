import { Hono } from 'hono';
import type { Env } from './index.js';
import { seedAdmin } from './admin/seed.js';
import { createSessionToken, verifyPassword } from './admin/auth.js';

/**
 * Bootstrap the admin user from ADMIN_USERNAME / ADMIN_PASSWORD env vars.
 * Idempotent — safe to call on every cold start.
 */
export async function bootstrapAdmin(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  const dbAuthToken = process.env.DATABASE_AUTH_TOKEN;
  const tenantId = process.env.TENANT_ID ?? 'default';
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!dbUrl) return;

  if (adminUsername && adminPassword) {
    const isEdge = typeof (globalThis as any).EdgeRuntime !== 'undefined';
    const { createClient } = isEdge
      ? await import('@libsql/client/web')
      : await import('@libsql/client');

    const client = createClient({ url: dbUrl, authToken: dbAuthToken });
    try {
      await seedAdmin(client, tenantId, { username: adminUsername, password: adminPassword });
    } finally {
      client.close();
    }
  }
}

/**
 * Register admin REST API routes on the Hono app.
 *
 * Routes:
 * - GET  /admin/health       — health check
 * - POST /admin/auth/login   — authenticate with username + password, returns JWT
 */
export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get('/admin/health', (c) => {
    return c.json({ status: 'ok' });
  });

  app.post('/admin/auth/login', async (c) => {
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

      const env = c.env;
      const tenantId = env?.TENANT_ID ?? process.env.TENANT_ID ?? 'default';
      const dbUrl = env?.DATABASE_URL ?? process.env.DATABASE_URL ?? '';
      const dbAuthToken = env?.DATABASE_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN;

      if (!dbUrl) {
        return c.json({ error: 'DATABASE_URL not configured' }, 500);
      }

      const { createDb } = await import('@sechel-mcp/core');
      const db = await createDb({ url: dbUrl, authToken: dbAuthToken });

      const { sql } = await import('kysely');
      const user = await sql<{
        id: number; username: string; role: string; credential_hash: string; is_active: number
      }>`
        SELECT id, username, role, credential_hash, is_active
        FROM users
        WHERE tenant_id = ${tenantId} AND username = ${username}
        LIMIT 1
      `.execute(db);

      await db.destroy();

      if (user.rows.length === 0) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      const row = user.rows[0];
      if (!row.is_active) {
        return c.json({ error: 'Account is disabled' }, 403);
      }

      const valid = await verifyPassword(password, row.credential_hash);
      if (!valid) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      const sessionToken = await createSessionToken({
        userId: row.id,
        tenantId,
        role: row.role,
      });

      return c.json({
        token: sessionToken,
        user: { id: row.id, username: row.username, role: row.role },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ error: message }, 500);
    }
  });
}
