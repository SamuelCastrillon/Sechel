import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken, parseSessionCookie } from './lib/session';

// Paths that are publicly reachable without a session.
const PUBLIC_PATHS = ['/admin/login', '/admin/register'];

/**
 * Protect all /admin/* pages behind a valid session cookie.
 *
 * The JWT is verified with the same JWT_SECRET used by @sechel/server, so
 * tokens issued by POST /api/admin/auth/login are accepted here. On
 * Cloudflare the bindings arrive via locals.runtime.env and are passed
 * through as the secret override — otherwise import.meta.env / process.env
 * are used, matching the embedded server's resolveEmbeddedEnv strategy.
 * Requests without a valid session are redirected to the login page. The
 * /api/* endpoints are deliberately left untouched — the embedded Hono app
 * enforces its own auth for protected routes.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isAdminPage = pathname.startsWith('/admin/') || pathname === '/admin';
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (isAdminPage && !isPublic) {
    const token = parseSessionCookie(context.request.headers.get('cookie'));
    const runtime = (context.locals as unknown as {
      runtime?: { env?: Record<string, string | undefined> };
    }).runtime;
    const payload = token
      ? await verifySessionToken(token, runtime?.env?.JWT_SECRET)
      : null;

    if (!payload) {
      return context.redirect('/admin/login');
    }
  }

  return next();
});
