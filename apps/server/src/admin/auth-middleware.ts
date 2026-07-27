import type { MiddlewareHandler } from 'hono';
import { verifySessionToken } from './auth.js';

/**
 * Paths that are exempt from JWT authentication.
 * These must match the mounted prefix-relative paths
 * (e.g. '/health' not '/admin/health').
 */
export const EXEMPT_PATHS = ['/health', '/auth/login'];

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
    const relative = path.replace(/^\/[^/]+/, ''); // strip first segment
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
      const match = cookie.match(/session=([^;]+)/);
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

import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';

export function getUser(c: { get: (key: string) => unknown }): { userId: number; tenantId: string; role: string } {
  return c.get('user') as { userId: number; tenantId: string; role: string };
}

export function getDb(c: { get: (key: string) => unknown }): Kysely<CortexDB> {
  return c.get('db') as Kysely<CortexDB>;
}
