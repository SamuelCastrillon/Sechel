import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken, parseSessionCookie } from './lib/session';

// Paths that are publicly reachable without a session.
const PUBLIC_PATHS = ['/admin/login', '/admin/register'];

/**
 * Protect all /admin/* pages behind a valid session cookie.
 *
 * The JWT is verified with the same JWT_SECRET used by @sechel/server, so
 * tokens issued by POST /api/admin/auth/login are accepted here. Requests
 * without a valid session are redirected to the login page. The /api/*
 * endpoints are deliberately left untouched — the embedded Hono app enforces
 * its own auth for protected routes.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isAdminPage = pathname.startsWith('/admin/') || pathname === '/admin';
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (isAdminPage && !isPublic) {
    const token = parseSessionCookie(context.request.headers.get('cookie'));
    const payload = token ? await verifySessionToken(token) : null;

    if (!payload) {
      return context.redirect('/admin/login');
    }
  }

  return next();
});
