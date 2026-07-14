import { Hono } from 'hono';
import type { Env } from './index.js';

/**
 * Register admin REST API routes on the Hono app.
 *
 * Currently provides:
 * - GET /admin/health — health check endpoint
 * - POST /admin/auth/login — auth placeholder (returns 501)
 *
 * Admin routes are unauthenticated in this version. Auth middleware
 * will be added when admin features are implemented.
 */
export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  /** Health check — always returns ok */
  app.get('/admin/health', (c) => {
    return c.json({ status: 'ok' });
  });

  /** Auth login placeholder — not yet implemented */
  app.post('/admin/auth/login', async (c) => {
    return c.json({ error: 'Not implemented yet' }, 501);
  });
}
