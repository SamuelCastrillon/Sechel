import { defineMiddleware } from 'astro:middleware';
import { guardAdminRequest } from './lib/session';

/**
 * Protect all /admin/* pages behind a valid session (PR-2).
 *
 * The JWT is verified with the same JWT_SECRET used by @sechel/server, so
 * tokens issued by POST /api/admin/auth/login are accepted here. On
 * Cloudflare the bindings arrive via locals.runtime.env and are passed
 * through as the secret override — otherwise import.meta.env / process.env
 * are used, matching the embedded server's resolveEmbeddedEnv strategy.
 *
 * When the access cookie fails verification (expired/invalid), the guard
 * attempts ONE refresh against the embedded server (getEmbeddedApp +
 * handleApiRequest — the same path pages/api/[...path].ts uses) and forwards
 * the rotated session=/refresh= cookies on the page response. Refresh failure
 * redirects to /admin/login. The /api/* endpoints are deliberately left
 * untouched — the embedded Hono app enforces its own auth for protected
 * routes.
 */
export const onRequest = defineMiddleware((context, next) =>
  guardAdminRequest(context, next),
);
