import type { MiddlewareHandler } from 'hono';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import { verifySessionToken } from './auth.js';

/**
 * Paths that are exempt from JWT authentication.
 * These must match the mounted prefix-relative paths
 * (e.g. '/health' not '/admin/health').
 *
 * /auth/refresh is exempt by design (RT-1): the refresh endpoint authenticates
 * via the refresh= cookie / body refresh_token, not the access JWT.
 */
export const EXEMPT_PATHS = [
  '/health',
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/public/registration-enabled',
];

/**
 * Auth middleware for admin routes.
 *
 * Extracts JWT from:
 *   1. Cookie `session=<token>` (standalone mode)
 *   2. `Authorization: Bearer <token>` (programmatic clients)
 *
 * Verifies with verifySessionToken() using the optional secret.
 * Injects the verified payload at `c.set('user', payload)`.
 *
 * Exempts paths in EXEMPT_PATHS (health check and login). Exemption is an
 * exact match on the mount-prefix-relative path only — a route such as
 * `/audit/auth/login` must never become public because it ends with an
 * exempt suffix.
 */
export function authMiddleware(jwtSecret?: string, mountPrefix = '/admin'): MiddlewareHandler {
  return async (c, next) => {
    // `c.req.path` is the full request path (mount prefix included), so
    // strip the known mount prefix and compare exactly against the
    // prefix-relative EXEMPT_PATHS entries.
    const path = c.req.path;
    const relative = path.startsWith(mountPrefix) ? path.slice(mountPrefix.length) : path;
    const isExempt = EXEMPT_PATHS.includes(relative);

    if (isExempt) {
      return next();
    }

    // Extract token from Cookie or Authorization header
    let token: string | undefined;
    let cookieAuth = false;

    const cookie = c.req.header('Cookie');
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
      if (match) {
        token = match[1];
        cookieAuth = true;
      }
    }

    if (!token) {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // CSRF defense-in-depth: cookie-authenticated state-changing requests
    // must be same-origin (browsers always send Origin on cross-site POSTs;
    // SameSite=Lax alone is not sufficient for POSTs that do not trigger a
    // top-level navigation). Bearer-authenticated requests are not subject
    // to CSRF and are left untouched.
    const isMutating = c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS';
    const origin = c.req.header('Origin');
    if (cookieAuth && isMutating && origin) {
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

    try {
      const payload = await verifySessionToken(token, jwtSecret);

      // Per-request DB check (SR-1): the sid claim must resolve to a live
      // session row — not revoked, not expired — and the user must still be
      // active. Role comes from the DB (not the JWT claim) so demotions and
      // deactivations apply immediately, with no TTL wait. The db-setter
      // middleware runs before authMiddleware, so getDb(c) is available here.
      const db = getDb(c);
      if (!db) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const session = await sql<{ id: string; role: string }>`
        SELECT s.id, u.role
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = ${payload.sid}
          AND s.tenant_id = ${payload.tenantId}
          AND s.revoked_at IS NULL
          AND s.expires_at > datetime('now')
          AND u.is_active = 1
        LIMIT 1
      `.execute(db);

      // Missing / revoked / expired / inactive all fold into the same 401 as
      // an invalid token — no session-state leak (design decision 5).
      if (session.rows.length === 0) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      c.set('user', {
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: session.rows[0].role,
        sid: payload.sid,
      });
      await next();
    } catch {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  };
}

// Type-safe access helpers for context variables.
// The `user` and `db` context variables are set by middleware and
// read by route handlers. Use these accessors instead of raw c.get().

export function getUser(c: { get: (key: string) => unknown }): {
  userId: number;
  tenantId: string;
  role: string;
  sid: string;
} {
  return c.get('user') as { userId: number; tenantId: string; role: string; sid: string };
}

export function getDb(c: { get: (key: string) => unknown }): Kysely<CortexDB> {
  return c.get('db') as Kysely<CortexDB>;
}

/**
 * Require a specific role to access the route.
 * If no user is set in context (exempt paths like /health, /auth/login),
 * the check is skipped so those routes remain public.
 *
 * Use as middleware before route definitions:
 *
 *   router.use(requireRole('admin'));
 */
export function requireRole(role: string) {
  return async (c: any, next: any) => {
    const user = getUser(c);
    // Skip check when no user is set (exempt paths)
    if (!user) return next();
    if (user.role !== role) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  };
}
