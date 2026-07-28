import { randomBytes, createHash } from 'node:crypto';
import type { Hono } from 'hono';
import { sql } from 'kysely';
import { getUser, getDb, requireRole } from './auth-middleware.js';

/**
 * Generate a new API token with:
 * - `raw`: 80-char hex string (40 random bytes)
 * - `hash`: SHA-256 hex of the raw token (for storage/lookup)
 * - `prefix`: "sk_" + first 7 chars (for UI display)
 */
export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = randomBytes(40).toString('hex');
  const hash = createHash('sha256').update(raw, 'utf-8').digest('hex');
  const prefix = 'sk_' + raw.slice(0, 7);
  return { raw, hash, prefix };
}

/**
 * Register token CRUD routes on the given Hono router.
 *
 * Routes:
 *   GET    /tokens       — list all tokens (no hash/raw exposed)
 *   POST   /tokens       — create a new token (raw returned once)
 *   DELETE /tokens/:id   — hard-delete a token
 */
export function registerTokenRoutes(router: Hono): void {
  // Require admin role for all token management routes
  router.use(requireRole('admin'));

  // GET /tokens — list all tokens
  router.get('/tokens', async (c) => {
    const db = getDb(c);
    const { tenantId } = getUser(c);

    const result = await sql<{
      id: number;
      prefix: string;
      description: string | null;
      last_used_at: string | null;
      created_at: string;
    }>`
      SELECT id, prefix, description, last_used_at, created_at
      FROM user_tokens
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `.execute(db);

    return c.json({ tokens: result.rows });
  });

  // POST /tokens — create a new token with one-time raw display
  router.post('/tokens', async (c) => {
    const db = getDb(c);
    const { tenantId, userId } = getUser(c);

    let description: string | undefined;
    try {
      const body = await c.req.json<{ description?: string }>();
      description = body.description;
    } catch {
      // body is optional, default to no description
    }

    const { raw, hash, prefix } = generateApiToken();

    const insertResult = await sql<{ id: number }>`
      INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash, description)
      VALUES (${tenantId}, ${userId}, ${prefix}, ${hash}, ${description ?? null})
      RETURNING id
    `.execute(db);
    const id = insertResult.rows[0].id;

    return c.json({
      id,
      prefix,
      description: description ?? null,
      raw,
      created_at: new Date().toISOString(),
    }, 200);
  });

  // DELETE /tokens/:id — hard-delete a token
  router.delete('/tokens/:id', async (c) => {
    const db = getDb(c);
    const { tenantId } = getUser(c);
    const id = Number(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ error: 'Invalid token id' }, 400);
    }

    const result = await sql`
      DELETE FROM user_tokens
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `.execute(db);

    // Kysely's numAffectedRows can be bigint or number
    const affected = Number(result.numAffectedRows ?? 0);
    if (affected === 0) {
      return c.json({ error: 'Token not found' }, 404);
    }

    return c.body(null, 204);
  });
}
