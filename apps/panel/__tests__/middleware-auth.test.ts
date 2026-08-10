import { describe, it, expect, beforeAll, vi } from 'vitest';
import { jwtVerify, SignJWT } from 'jose';
import {
  getEmbeddedApp,
  handleApiRequest,
  type EmbeddedAppEnv,
} from '../src/server/index';
import { guardAdminRequest } from '../src/lib/session';

// Deterministic argon2id hash for password 'admin123' (fixed zero salt).
const ADMIN_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$VpoaBhJVfGlo4F9ZQ0Kel4G/z5CzG+UCOyWCLWr5dgY';
const TEST_JWT_SECRET = 'test-secret-key-for-panel-tests-32chars!';
const TEST_ENV: EmbeddedAppEnv = {
  DATABASE_URL: ':memory:',
  JWT_SECRET: TEST_JWT_SECRET,
  TENANT_ID: 'default',
};

/**
 * Minimal structural stand-in for the Astro middleware context. guardAdminRequest
 * only touches url / request / locals / cookies.set / redirect, so a plain
 * object is enough — the real Astro APIContext satisfies the same shape.
 */
function fakeContext(
  cookieHeader: string | null,
  cookiesSet: Array<[string, string]>,
  pathname = '/admin/',
) {
  return {
    url: new URL(`http://localhost${pathname}`),
    request: new Request(`http://localhost${pathname}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    }),
    locals: { runtime: { env: TEST_ENV } },
    cookies: {
      set: (name: string, value: string) => {
        cookiesSet.push([name, value]);
      },
    },
    redirect: (path: string) =>
      new Response(null, { status: 302, headers: { Location: path } }),
  };
}

/** Login through the real embedded server and return the issued cookies + sid. */
async function loginCookies(): Promise<{
  sessionValue: string;
  refreshValue: string;
  sid: string;
}> {
  const res = await handleApiRequest(
    new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }),
    TEST_ENV,
  );
  expect(res.status).toBe(200);
  const cookies = res.headers.getSetCookie();
  const sessionValue = cookies
    .find((c) => c.startsWith('session='))!
    .split(';')[0]
    .slice('session='.length);
  const refreshValue = cookies
    .find((c) => c.startsWith('refresh='))!
    .split(';')[0]
    .slice('refresh='.length);
  const { payload } = await jwtVerify(
    sessionValue,
    new TextEncoder().encode(TEST_JWT_SECRET),
    { algorithms: ['HS256'] },
  );
  return { sessionValue, refreshValue, sid: payload.sid as string };
}

/** A session token that already failed verify — past its 15-min lifetime. */
async function expiredAccessToken(): Promise<string> {
  return new SignJWT({ userId: 1, role: 'admin', sid: 'stale-sid' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('-1m')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

describe('admin page guard — middleware refresh (PR-2)', () => {
  beforeAll(async () => {
    const { db } = await getEmbeddedApp(TEST_ENV);
    await db
      .insertInto('users')
      .values({
        tenant_id: 'default',
        username: 'admin',
        role: 'admin',
        credential_hash: ADMIN_HASH,
      })
      .execute();
  });

  it('valid access cookie → page renders, no refresh call', async () => {
    const { sessionValue } = await loginCookies();
    const cookiesSet: Array<[string, string]> = [];
    const context = fakeContext(`session=${sessionValue}`, cookiesSet) as never;
    const next = vi.fn(async () => new Response('<html>admin</html>', { status: 200 }));

    const res = await guardAdminRequest(context, next);

    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(cookiesSet).toHaveLength(0);

    // The verified access token is stashed for SSR data fetches (U5).
    const locals = (context as { locals: Record<string, unknown> }).locals;
    expect(locals.sessionToken).toBe(sessionValue);
  });

  it('expired access + valid refresh → refresh happens, rotated cookies forwarded, page renders', async () => {
    const { refreshValue } = await loginCookies();
    const expired = await expiredAccessToken();
    const cookiesSet: Array<[string, string]> = [];
    const context = fakeContext(`session=${expired}; refresh=${refreshValue}`, cookiesSet) as never;
    const next = vi.fn(async () => new Response('<html>admin</html>', { status: 200 }));

    const res = await guardAdminRequest(context, next);

    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);

    const session = cookiesSet.find(([name]) => name === 'session');
    const refresh = cookiesSet.find(([name]) => name === 'refresh');
    expect(session).toBeDefined();
    expect(refresh).toBeDefined();

    // The forwarded access cookie is the NEW 15-min JWT (not the expired one)
    // and still binds to a real session row (sid claim).
    expect(session![1]).not.toBe(expired);
    const { payload } = await jwtVerify(
      session![1],
      new TextEncoder().encode(TEST_JWT_SECRET),
      { algorithms: ['HS256'] },
    );
    expect(typeof payload.sid).toBe('string');
    // Rotation: the refresh cookie value changed vs the one from login.
    expect(refresh![1]).not.toBe(refreshValue);

    // U5: the middleware stashes the refreshed access token in locals so pages
    // can SSR-fetch through the embedded server. The browser cookie is still
    // one rotation behind — only the stashed token passes the DB join.
    const locals = (context as { locals: Record<string, unknown> }).locals;
    expect(typeof locals.sessionToken).toBe('string');
    expect(locals.sessionToken).not.toBe(expired);
    const ssr = await handleApiRequest(
      new Request('http://localhost/api/admin/auth/sessions', {
        headers: { Cookie: `session=${locals.sessionToken as string}` },
      }),
      TEST_ENV,
    );
    expect(ssr.status).toBe(200);
    const body = (await ssr.json()) as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it('revoked session → refresh 401 → redirect to login, page not rendered', async () => {
    const { sessionValue, refreshValue, sid } = await loginCookies();
    // Server-side revoke via the real endpoint (SR-2 device revoke).
    const revoked = await handleApiRequest(
      new Request(`http://localhost/api/admin/auth/sessions/${sid}`, {
        method: 'DELETE',
        headers: { Cookie: `session=${sessionValue}` },
      }),
      TEST_ENV,
    );
    expect(revoked.status).toBe(204);

    const expired = await expiredAccessToken();
    const cookiesSet: Array<[string, string]> = [];
    const next = vi.fn(async () => new Response('<html>admin</html>', { status: 200 }));

    const res = await guardAdminRequest(
      fakeContext(`session=${expired}; refresh=${refreshValue}`, cookiesSet) as never,
      next,
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/admin/login');
    expect(next).not.toHaveBeenCalled();
    expect(cookiesSet).toHaveLength(0);
  });

  it('no session cookies at all → redirect to login without any refresh attempt', async () => {
    const cookiesSet: Array<[string, string]> = [];
    const next = vi.fn(async () => new Response('<html>admin</html>', { status: 200 }));

    const res = await guardAdminRequest(fakeContext(null, cookiesSet) as never, next);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/admin/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('public login page is not guarded', async () => {
    const cookiesSet: Array<[string, string]> = [];
    const next = vi.fn(async () => new Response('<html>login</html>', { status: 200 }));

    const res = await guardAdminRequest(
      fakeContext(null, cookiesSet, '/admin/login') as never,
      next,
    );

    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
