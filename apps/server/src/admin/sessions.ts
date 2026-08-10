import type { Hono } from 'hono';
import { sql } from 'kysely';
import {
  createSessionToken,
  generateRefreshToken,
  sha256Hex,
  sessionCookieString,
  refreshCookieString,
  isSecureRequest,
} from './auth.js';
import { getDb, getUser, requireRole } from './auth-middleware.js';
import { createRateLimiter, clientIp } from './rate-limit.js';

/**
 * Session refresh endpoint (RT-1..RT-4).
 *
 * POST /auth/refresh — exempt from access-JWT auth (see EXEMPT_PATHS); it
 * authenticates with the `refresh=` HttpOnly cookie (primary transport) or
 * the JSON body `refresh_token` (fallback for cookie-less API clients).
 *
 * Rotation is ONE atomic `UPDATE ... WHERE refresh_hash=:old ... RETURNING`
 * (SQLite single-writer safe): the presented hash moves to prev_hash and a
 * fresh hash is stored, so the presented token is single-use by construction.
 *
 * Reuse detection (RT-3): a presented hash found in prev_hash within the
 * 60 s grace window → 401 only (two-tab safety, lineage untouched); after
 * the grace window → whole lineage revoked + 401 (replay). A hash found in
 * neither column → plain 401, no lineage action (attacker never learns
 * whether a hash existed).
 *
 * Fail-closed (RT-4): if the rotation write throws (e.g. remote libsql over
 * HTTP), NO tokens are issued, the row is untouched, and the client may retry.
 */
export function registerSessionRoutes(router: Hono, jwtSecret?: string): void {
  // Per-session-token bucket (design decision 10): clientIp + first 8 hex
  // chars of the presented hash, 60 s / max 10. No shared-IP lockout.
  const refreshLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

  router.post('/auth/refresh', async (c) => {
    const db = getDb(c);

    // Primary transport: refresh= cookie. Fallback: JSON body refresh_token.
    let presented: string | undefined;

    const cookie = c.req.header('Cookie');
    let cookieAuth = false;
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)refresh=([^;]+)/);
      if (match) {
        presented = match[1];
        cookieAuth = true;
      }
    }

    // CSRF defense-in-depth: cookie-authenticated refresh must be same-origin
    // (SameSite=Lax blocks cross-site POSTs, but a same-site-subdomain or
    // downgrade scenario must not be able to replay the ambient credential).
    // Body-transport refresh tokens carry no ambient credentials → not CSRF-able.
    if (cookieAuth) {
      const origin = c.req.header('Origin');
      if (origin) {
        try {
          const requestUrl = new URL(c.req.url);
          const requestHost = c.req.header('Host') ?? requestUrl.host;
          const originHost = new URL(origin).host;
          if (originHost !== requestHost) {
            return c.json({ error: 'Forbidden' }, 403);
          }
        } catch {
          return c.json({ error: 'Forbidden' }, 403);
        }
      }
    }

    if (!presented) {
      try {
        const body = await c.req.json<{ refresh_token?: string }>();
        presented = body.refresh_token;
      } catch {
        presented = undefined;
      }
    }

    if (!presented || typeof presented !== 'string') {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const oldHash = await sha256Hex(presented);
    const limiterKey = `${clientIp(c)}:${oldHash.slice(0, 8)}`;
    if (!refreshLimiter.allow(limiterKey)) {
      return c.json({ error: 'Too many refresh attempts. Try again later.' }, 429);
    }

    try {
      const { raw: newRaw, hash: newHash } = await generateRefreshToken();

      // Atomic rotation (RT-1). Never matches a revoked/NULL refresh_hash by
      // design: revoked rows either keep a hash (revoked_at IS NULL guard) or
      // drop it (NULL never equals :old).
      const rotated = await sql<{
        id: string;
        tenant_id: string;
        user_id: number;
        lineage_id: string;
      }>`
        UPDATE auth_sessions
        SET refresh_hash = ${newHash}, prev_hash = ${oldHash}, last_used_at = datetime('now')
        WHERE refresh_hash = ${oldHash}
          AND revoked_at IS NULL
          AND expires_at > datetime('now')
        RETURNING id, tenant_id, user_id, lineage_id
      `.execute(db);

      if (rotated.rows.length === 0) {
        // Reuse detection: is the presented hash a rotated-out hash?
        // Note: prev_hash lookups are unindexed by design (schema frozen in
        // PR 1) — acceptable for a replay-detection path.
        const prev = await sql<{ lineage_id: string; age: number }>`
          SELECT lineage_id,
                 (strftime('%s','now') - strftime('%s', last_used_at)) AS age
          FROM auth_sessions
          WHERE prev_hash = ${oldHash}
          LIMIT 1
        `.execute(db);

        if (prev.rows.length === 0) {
          // Unknown hash (never issued, or already rotated twice) → plain 401,
          // no lineage action (gate W3).
          return c.json({ error: 'Unauthorized' }, 401);
        }

        if (prev.rows[0].age < 60) {
          // Two-tab race within the 60 s grace window → 401 only, lineage
          // untouched so the loser can retry with the winner's cookie.
          return c.json({ error: 'Unauthorized' }, 401);
        }

        // Replay after grace → revoke the whole lineage + 401.
        await sql`
          UPDATE auth_sessions SET revoked_at = datetime('now')
          WHERE lineage_id = ${prev.rows[0].lineage_id}
        `.execute(db);
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const { id: sid, tenant_id: tenantId, user_id: userId, lineage_id: lineageId } = rotated.rows[0];

      // Role always comes from the DB at issuance time (SR-1); a deactivated
      // or deleted user must not receive a fresh access JWT.
      const user = await sql<{ role: string }>`
        SELECT u.role
        FROM users u
        WHERE u.id = ${userId} AND u.tenant_id = ${tenantId} AND u.is_active = 1
        LIMIT 1
      `.execute(db);

      if (user.rows.length === 0) {
        // The presented token was consumed by the rotation above and must
        // never work again — kill the lineage, fail closed.
        await sql`
          UPDATE auth_sessions SET revoked_at = datetime('now')
          WHERE lineage_id = ${lineageId}
        `.execute(db);
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const sessionToken = await createSessionToken(
        { userId, tenantId, role: user.rows[0].role, sid },
        jwtSecret,
      );

      // New access JWT (15 min) + rotated refresh cookie in one round trip
      // (design decision 6): panel fetches get the fresh access cookie.
      const secure = isSecureRequest(c);
      c.header('Set-Cookie', sessionCookieString(sessionToken, secure));
      c.header('Set-Cookie', refreshCookieString(newRaw, secure), { append: true });

      return c.json({ token: sessionToken });
    } catch (err) {
      // Fail closed: no tokens issued, row untouched, client may retry (RT-4).
      console.error('[admin/sessions] refresh failed:', err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // ---- Sessions list + device revoke (UI-1/2, SR-2) ----
  // Admin-only. These routes sit on the shared admin router, so requireRole
  // must be applied per-route here: registerSessionRoutes runs BEFORE
  // registerUserRoutes, whose blanket requireRole('admin') does not cover
  // routes registered earlier. (POST /auth/refresh above stays exempt.)

  router.get('/auth/sessions', requireRole('admin'), async (c) => {
    const db = getDb(c);
    const { tenantId } = getUser(c);

    // Public shape only: id + device metadata + timestamps + computed status.
    // NEVER expose refresh_hash / prev_hash / lineage_id (AS-1/UI-1).
    const result = await sql<{
      id: string;
      device_name: string | null;
      user_agent: string | null;
      ip: string | null;
      created_at: string;
      last_used_at: string;
      expires_at: string;
      revoked_at: string | null;
      status: string;
    }>`
      SELECT id, device_name, user_agent, ip, created_at, last_used_at, expires_at, revoked_at,
             CASE
               WHEN revoked_at IS NOT NULL THEN 'revoked'
               WHEN expires_at <= datetime('now') THEN 'expired'
               ELSE 'active'
             END AS status
      FROM auth_sessions
      WHERE tenant_id = ${tenantId}
      ORDER BY last_used_at DESC
    `.execute(db);

    return c.json({ sessions: result.rows });
  });

  router.delete('/auth/sessions/:id', requireRole('admin'), async (c) => {
    const db = getDb(c);
    const { tenantId } = getUser(c);
    const id = c.req.param('id');

    // Soft delete (AS-2): set revoked_at, keep the row for lineage audit.
    // Tenant-scoped: a row outside the tenant behaves like a missing row
    // (404), so operators cannot probe other tenants' session ids.
    const result = await sql`
      UPDATE auth_sessions SET revoked_at = datetime('now')
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `.execute(db);

    if (Number(result.numAffectedRows ?? 0) === 0) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.body(null, 204);
  });
}
