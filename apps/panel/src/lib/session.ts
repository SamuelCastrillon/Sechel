import { jwtVerify } from 'jose';
import {
  embeddedEnvFromLocals,
  handleApiRequest,
  type EmbeddedAppEnv,
} from '../server/index';
import type { SessionPayload } from './types';

/**
 * Cookie lifetimes — single source of truth for the panel's cookie handling.
 * They MUST match the embedded server's SESSION_COOKIE_MAX_AGE /
 * REFRESH_COOKIE_MAX_AGE (apps/server/src/admin/auth.ts): the access JWT is
 * short-lived (15 min) and sessions survive past it via /auth/refresh
 * rotation (PR-3 — no 15-minute cliff).
 */
export const SESSION_MAX_AGE = 900;
export const REFRESH_MAX_AGE = 2592000;

const SESSION_COOKIE_NAME = 'session';
const REFRESH_COOKIE_NAME = 'refresh';

/** Paths that are publicly reachable without a session. */
export const PUBLIC_PATHS = ['/admin/login', '/admin/register'];

/**
 * Resolve the JWT secret through the same strategy the embedded server uses
 * (see apps/panel/src/server/index.ts resolveEmbeddedEnv):
 *
 * 1. `override` — Cloudflare runtime bindings arrive via locals.runtime.env,
 *    which the middleware passes through for every request.
 * 2. `import.meta.env` — Astro loads `.env` there (local dev, Vercel).
 * 3. `process.env` — built Node deployments (docker / node entry).
 *
 * Signer and verifier must agree on the secret, otherwise every valid token
 * is rejected and /admin/* redirects in a loop.
 */
export function resolveJwtSecret(override?: string): string | undefined {
  if (override) return override;
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env ?? {};
  const proc = typeof process !== 'undefined' ? process.env : undefined;
  return meta.JWT_SECRET ?? proc?.JWT_SECRET;
}

function getSecret(override?: string): Uint8Array {
  const raw = resolveJwtSecret(override);
  if (!raw) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(raw);
}

export async function verifySessionToken(
  token: string,
  secret?: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(secret), {
      algorithms: ['HS256'],
    });
    const userId = payload.userId as number | undefined;
    const role = payload.role as string | undefined;
    if (typeof userId !== 'number' || typeof role !== 'string') return null;
    return { userId, role };
  } catch {
    return null;
  }
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  return parseCookie(cookieHeader, SESSION_COOKIE_NAME);
}

export function parseRefreshCookie(cookieHeader: string | null): string | null {
  return parseCookie(cookieHeader, REFRESH_COOKIE_NAME);
}

// ── Middleware refresh (PR-2) ──

export interface RefreshResult {
  payload: SessionPayload;
  /** Raw Set-Cookie strings from the refresh response (session= + refresh=). */
  cookies: string[];
}

/**
 * Attempt one refresh against the embedded server (getEmbeddedApp +
 * handleApiRequest — the same path used by pages/api/[...path].ts, so the
 * refresh NEVER runs through the panel's own 401 logic).
 *
 * Returns null when there is nothing to refresh, the refresh is rejected
 * (expired / revoked / reused), or the new access JWT fails verification.
 * On success the rotated `session=` / `refresh=` cookies are returned so the
 * caller can forward them on the page response.
 */
export async function tryRefreshSession(
  cookieHeader: string | null,
  env?: EmbeddedAppEnv,
  secret?: string,
): Promise<RefreshResult | null> {
  if (!cookieHeader || (!parseSessionCookie(cookieHeader) && !parseRefreshCookie(cookieHeader))) {
    return null;
  }

  const refreshRequest = new Request('http://localhost/api/admin/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
  });

  const res = await handleApiRequest(refreshRequest, env);
  if (!res.ok) return null;

  const body = (await res.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return null;

  const payload = await verifySessionToken(body.token, secret);
  if (!payload) return null;

  return { payload, cookies: res.headers.getSetCookie() };
}

/**
 * Minimal structural view of the Astro middleware context. The real APIContext
 * satisfies this shape (url / request / locals / cookies.set / redirect).
 */
export interface AdminGuardContext {
  url: URL;
  request: Request;
  locals: object;
  cookies: {
    set(name: string, value: string, options?: Record<string, unknown>): void;
  };
  redirect(path: string): Response;
}

/**
 * Protect all /admin/* pages behind a valid session (PR-2):
 *
 * - valid access cookie → render the page;
 * - expired/invalid access cookie → one refresh via the embedded server and
 *   forward the rotated cookies (Secure-aware) so the page response carries
 *   them;
 * - refresh failure → redirect to /admin/login.
 *
 * /api/* paths are left untouched — the embedded Hono app enforces its own
 * auth for protected routes.
 */
export async function guardAdminRequest(
  context: AdminGuardContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const { pathname } = context.url;

  const isAdminPage = pathname.startsWith('/admin/') || pathname === '/admin';
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (isAdminPage && !isPublic) {
    const cookieHeader = context.request.headers.get('cookie');
    const runtime = (context.locals as {
      runtime?: { env?: Record<string, string | undefined> };
    }).runtime;
    const secret = runtime?.env?.JWT_SECRET;

    let payload: SessionPayload | null = null;
    const sessionToken = parseSessionCookie(cookieHeader);
    if (sessionToken) {
      payload = await verifySessionToken(sessionToken, secret);
    }

    if (!payload) {
      const refreshed = await tryRefreshSession(
        cookieHeader,
        embeddedEnvFromLocals(context.locals as Record<string, unknown>),
        secret,
      );

      if (refreshed) {
        for (const raw of refreshed.cookies) {
          const eq = raw.indexOf('=');
          if (eq <= 0) continue;
          const name = raw.slice(0, eq).trim();
          const value = raw.slice(eq + 1).split(';')[0].trim();
          if (name !== SESSION_COOKIE_NAME && name !== REFRESH_COOKIE_NAME) continue;
          context.cookies.set(name, value, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: context.url.protocol === 'https:',
            maxAge: name === SESSION_COOKIE_NAME ? SESSION_MAX_AGE : REFRESH_MAX_AGE,
          });
        }
        payload = refreshed.payload;
      }
    }

    if (!payload) {
      return context.redirect('/admin/login');
    }
  }

  return next();
}
