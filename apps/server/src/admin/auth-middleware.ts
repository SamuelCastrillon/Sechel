import type { MiddlewareHandler } from 'hono';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import { verifySessionToken } from './auth.js';

/**
 * Paths that are exempt from JWT authentication.
 * These must match the mounted prefix-relative paths
 * (e.g. '/health' not '/admin/health').
 */
export const EXEMPT_PATHS = [
  '/health',
  '/auth/login',
  '/auth/register',
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
      c.set('user', payload);
      await next();
    } catch {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  };
}

// Type-safe access helpers for context variables.
// The `user` and `db` context variables are set by middleware and
// read by route handlers. Use these accessors instead of raw c.get().

export function getUser(c: { get: (key: string) => unknown }): { userId: number; tenantId: string; role: string } {
  return c.get('user') as { userId: number; tenantId: string; role: string };
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
