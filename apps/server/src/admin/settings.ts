import type { Hono } from 'hono';
import { sql } from 'kysely';
import { getDb, requireRole } from './auth-middleware.js';

/**
 * Allowed setting keys that can be updated.
 */
const ALLOWED_SETTING_KEYS = ['registration_enabled'];

/**
 * Register settings CRUD routes on the given Hono router.
 *
 * Routes:
 *   GET    /settings    — return all instance settings as key-value object
 *   PATCH  /settings    — update allowed settings keys
 */
export function registerSettingsRoutes(router: Hono): void {
  // Require admin role for all settings management routes
  router.use(requireRole('admin'));

  // GET /settings — return all instance settings as key-value object
  router.get('/settings', async (c) => {
    const db = getDb(c);

    const result = await sql<{ key: string; value: string }>`
      SELECT key, value FROM instance_settings ORDER BY key
    `.execute(db);

    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return c.json(settings);
  });

  // PATCH /settings — update allowed settings keys
  router.patch('/settings', async (c) => {
    const db = getDb(c);

    let body: Record<string, string>;
    try {
      body = await c.req.json<Record<string, string>>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    // Validate each key against the allowlist
    for (const key of Object.keys(body)) {
      if (!ALLOWED_SETTING_KEYS.includes(key)) {
        return c.json({ error: `Unknown setting key: ${key}` }, 400);
      }
    }

    // Upsert each setting
    for (const [key, value] of Object.entries(body)) {
      await sql`
        INSERT INTO instance_settings (key, value, updated_at)
        VALUES (${key}, ${value}, datetime('now'))
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `.execute(db);
    }

    // Return the full updated settings object
    const result = await sql<{ key: string; value: string }>`
      SELECT key, value FROM instance_settings ORDER BY key
    `.execute(db);

    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return c.json(settings);
  });
}
