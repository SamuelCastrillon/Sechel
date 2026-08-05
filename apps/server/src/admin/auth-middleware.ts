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
 * Exempts paths in EXEMPT_PATHS (health check and login).
 */
export function authMiddleware(jwtSecret?: string): MiddlewareHandler {
  return async (c, next) => {
    // Check exempt paths — compare only the path-relative portion
    // (the Hono router strips the mount prefix for sub-routers,
    //  but we match both absolute and relative for safety)
    const path = c.req.path;
    // relative path: strip the mount prefix (first segment) to compare
    // against EXEMPT_PATHS entries that are prefix-relative.
    // endsWith fallback handles custom prefixes like /api/admin/health
    // where the relative path after stripping one segment isn't enough.
    const relative = path.replace(/^\/[^/]+/, '');
    const isExempt = EXEMPT_PATHS.some(
      (p) => path === p || path.endsWith(p) || relative === p,
    );

    if (isExempt) {
      return next();
    }

    // Extract token from Cookie or Authorization header
    let token: string | undefined;

    const cookie = c.req.header('Cookie');
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
      if (match) token = match[1];
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
