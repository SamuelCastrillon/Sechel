import { describe, it, expect, beforeAll } from 'vitest';
import { jwtVerify } from 'jose';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getEmbeddedApp,
  handleApiRequest,
  type EmbeddedAppEnv,
} from '../src/server/index';
import { loadAdminSessions } from '../src/lib/admin-sessions';
import { SessionsList } from '../src/components/sessions/SessionsList';
import type { AdminSession } from '../src/lib/types';

// Deterministic argon2id hash for password 'admin123' (fixed zero salt) —
// reused for the member user too (its password is never verified here).
const ADMIN_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$VpoaBhJVfGlo4F9ZQ0Kel4G/z5CzG+UCOyWCLWr5dgY';
const TEST_JWT_SECRET = 'test-secret-key-for-panel-tests-32chars!';
const TEST_ENV: EmbeddedAppEnv = {
  DATABASE_URL: ':memory:',
  JWT_SECRET: TEST_JWT_SECRET,
  TENANT_ID: 'default',
};

/** Astro locals equivalent: the middleware exposes runtime bindings here. */
const runtimeLocals = { runtime: { env: TEST_ENV } };

/** Login through the real embedded server and return cookies + sid. */
async function login(
  username: string,
): Promise<{ sessionValue: string; refreshValue: string; sid: string; cookieHeader: string }> {
  const res = await handleApiRequest(
    new Request('http://localhost/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'admin123' }),
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
  return {
    sessionValue,
    refreshValue,
    sid: payload.sid as string,
    cookieHeader: `session=${sessionValue}; refresh=${refreshValue}`,
  };
}

async function revokeViaApi(sessionId: string, actorCookieHeader: string) {
  return handleApiRequest(
    new Request(`http://localhost/api/admin/auth/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Cookie: actorCookieHeader },
    }),
    TEST_ENV,
  );
}

describe('sessions UI — SSR data + render (UI-1/UI-2)', () => {
  beforeAll(async () => {
    const { db } = await getEmbeddedApp(TEST_ENV);
    await db
      .insertInto('users')
      .values({ tenant_id: 'default', username: 'admin', role: 'admin', credential_hash: ADMIN_HASH })
      .execute();
    await db
      .insertInto('users')
      .values({ tenant_id: 'default', username: 'sessions-member', role: 'member', credential_hash: ADMIN_HASH })
      .execute();
    // A distinct device row (direct insert — the login endpoint only ever
    // writes device_name 'web'), so render assertions can tell rows apart.
    await db
      .insertInto('auth_sessions')
      .values({
        id: 'sess-old-laptop',
        tenant_id: 'default',
        user_id: 1,
        device_name: 'old-laptop',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ip: '10.0.0.7',
        expires_at: new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' '),
        refresh_hash: 'hash-old-laptop',
        lineage_id: crypto.randomUUID(),
      })
      .execute();
  });

  it('lists sessions with statuses and currentSessionId from the verified token', async () => {
    const a = await login('admin');
    const b = await login('admin');

    const data = await loadAdminSessions(
      a.cookieHeader,
      { ...runtimeLocals, sessionToken: a.sessionValue },
    );

    expect(data).not.toBeNull();
    const sessions = data!.sessions;
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    expect(sessions.find((s) => s.id === a.sid)).toMatchObject({ status: 'active' });
    expect(sessions.find((s) => s.id === b.sid)).toMatchObject({ status: 'active' });
    expect(sessions.find((s) => s.id === 'sess-old-laptop')).toMatchObject({
      device_name: 'old-laptop',
      status: 'active',
    });
    // Never expose hashes (AS-1/UI-1).
    for (const s of sessions) {
      expect(s).not.toHaveProperty('refresh_hash');
      expect(s).not.toHaveProperty('prev_hash');
      expect(s).not.toHaveProperty('lineage_id');
    }
    expect(data!.currentSessionId).toBe(a.sid);
  });

  it('falls back to the request cookie when locals.sessionToken is absent', async () => {
    const b = await login('admin');

    const data = await loadAdminSessions(b.cookieHeader, runtimeLocals);

    expect(data).not.toBeNull();
    expect(data!.sessions.find((s) => s.id === b.sid)?.status).toBe('active');
    expect(data!.currentSessionId).toBe(b.sid);
  });

  it('revoke one device → server 204, row flips to revoked, other devices stay active', async () => {
    const a = await login('admin');
    const c = await login('admin');

    const del = await revokeViaApi(a.sid, c.cookieHeader);
    expect(del.status).toBe(204);

    const data = await loadAdminSessions(
      c.cookieHeader,
      { ...runtimeLocals, sessionToken: c.sessionValue },
    );

    expect(data!.sessions.find((s) => s.id === a.sid)?.status).toBe('revoked');
    expect(data!.sessions.find((s) => s.id === c.sid)?.status).toBe('active');
    expect(data!.sessions.find((s) => s.id === 'sess-old-laptop')?.status).toBe('active');
  });

  it('member session → API rejects with 403 and the loader returns null', async () => {
    const member = await login('sessions-member');

    const api = await handleApiRequest(
      new Request('http://localhost/api/admin/auth/sessions', {
        headers: { Cookie: `session=${member.sessionValue}` },
      }),
      TEST_ENV,
    );
    expect(api.status).toBe(403);

    const data = await loadAdminSessions(member.cookieHeader, runtimeLocals);
    expect(data).toBeNull();
  });

  it('revoked stale cookie → loader returns null (graceful bounce, no crash)', async () => {
    const d = await login('admin');

    // Self-revoke: the current device kills its own session (SR-2).
    const del = await revokeViaApi(d.sid, d.cookieHeader);
    expect(del.status).toBe(204);

    // The cookie is still crypto-valid (middleware would pass it), but the
    // embedded server's DB join rejects the revoked row → null → page bounces.
    const data = await loadAdminSessions(
      d.cookieHeader,
      { ...runtimeLocals, sessionToken: d.sessionValue },
    );
    expect(data).toBeNull();
  });

  it('renders device rows, status badges, revoke only on active rows, and the this-device hint', async () => {
    const f = await login('admin');
    const g = await login('admin');
    await revokeViaApi(f.sid, g.cookieHeader);

    const data = await loadAdminSessions(
      g.cookieHeader,
      { ...runtimeLocals, sessionToken: g.sessionValue },
    );
    const revokedRow = data!.sessions.find((s) => s.id === f.sid)!;
    const oldLaptopRow = data!.sessions.find((s) => s.id === 'sess-old-laptop')!;

    const markup = renderToStaticMarkup(
      <SessionsList
        initialSessions={[revokedRow, oldLaptopRow]}
        currentSessionId={oldLaptopRow.id}
      />,
    );

    expect(markup).toContain('old-laptop'); // device_name is displayed, not hardcoded
    expect(markup).toContain('REVOKED');
    expect(markup).toContain('ACTIVE');
    expect(markup).toContain('This device');
    // Only the active row offers a revoke control.
    const revokeButtons = markup.match(/>Revoke</g) ?? [];
    expect(revokeButtons).toHaveLength(1);
  });

  it('renders an empty state when there are no sessions', () => {
    const markup = renderToStaticMarkup(<SessionsList initialSessions={[]} />);
    expect(markup).toContain('No sessions found');
  });
});
