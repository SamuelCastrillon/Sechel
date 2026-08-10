import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { SignJWT, jwtVerify } from 'jose';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import type { Env } from '../src/index.js';
import { createSessionToken, hashPassword } from '../src/admin/auth.js';

// ---------------------------------------------------------------------------
// Setup: temp SQLite DB, seed admin + member, capture a real session cookie
// ---------------------------------------------------------------------------

const TEST_DB_PATH = join(tmpdir(), `sechel-test-middleware-${Date.now()}.db`);
const TEST_JWT_SECRET = 'middleware-test-secret-32-chars-min!!';
const TENANT = 'mwtest';
const ADMIN_USERNAME = 'mw-admin';
const ADMIN_PASSWORD = 'mw-password';
const MEMBER_USERNAME = 'mw-member';
const MEMBER_PASSWORD = 'mw-member-password';

let db: Kysely<CortexDB>;
let app: Hono<{ Bindings: Env }>;
let testEnv: Env;

let ADMIN_TOKEN: string;
let MEMBER_TOKEN: string;
let ADMIN_COOKIE: string;
let REFRESH_COOKIE: string;

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  // Step 1: raw client, migrations, seed admin + member
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: `file:${TEST_DB_PATH}` });
  const { runMigrations } = await import('@sechel-mcp/core');
  await runMigrations(client);
  const { seedAdmin } = await import('../src/admin/seed.js');
  await seedAdmin(client, TENANT, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  const memberHash = await hashPassword(MEMBER_PASSWORD);
  await client.execute({
    sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
          VALUES (?, ?, 'member', ?, 1, datetime('now'))`,
    args: [TENANT, MEMBER_USERNAME, memberHash],
  });
  const memberRow = await client.execute({
    sql: `SELECT id FROM users WHERE tenant_id = ? AND username = ?`,
    args: [TENANT, MEMBER_USERNAME],
  });
  const memberId = Number(memberRow.rows[0].id);
  client.close();

  // Step 2: shared Kysely instance
  const { createDb } = await import('@sechel-mcp/core');
  db = await createDb({ url: `file:${TEST_DB_PATH}` });

  testEnv = { DATABASE_URL: `file:${TEST_DB_PATH}`, TENANT_ID: TENANT };

  // Step 3: app + tokens. Access JWTs carry a sid claim and the middleware
  // re-validates the session row per request (SR-1), so DB-backed rows are
  // created for both users.
  const mod = await import('../src/index.js');
  app = mod.createApp({ db, jwtSecret: TEST_JWT_SECRET });

  const adminSid = crypto.randomUUID();
  const memberSid = crypto.randomUUID();
  await sql`
    INSERT INTO auth_sessions (id, tenant_id, user_id, device_name, expires_at, refresh_hash, lineage_id)
    VALUES (${adminSid}, ${TENANT}, 1, 'test-client', datetime('now', '+30 days'), ${`hash-${adminSid}`}, ${crypto.randomUUID()}),
           (${memberSid}, ${TENANT}, ${memberId}, 'test-client', datetime('now', '+30 days'), ${`hash-${memberSid}`}, ${crypto.randomUUID()})
  `.execute(db);

  ADMIN_TOKEN = await createSessionToken(
    { userId: 1, tenantId: TENANT, role: 'admin', sid: adminSid },
    TEST_JWT_SECRET,
  );
  MEMBER_TOKEN = await createSessionToken(
    { userId: memberId, tenantId: TENANT, role: 'member', sid: memberSid },
    TEST_JWT_SECRET,
  );

  // Step 4: real login to capture the HttpOnly cookies (session + refresh)
  const loginRes = await app.request('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  }, testEnv);
  expect(loginRes.status).toBe(200);
  const loginCookies = loginRes.headers.getSetCookie();
  expect(loginCookies.length).toBe(2);
  ADMIN_COOKIE = loginCookies[0] ?? '';
  REFRESH_COOKIE = loginCookies[1] ?? '';
  expect(ADMIN_COOKIE).toContain('session=');
  expect(ADMIN_COOKIE).toContain('HttpOnly');
  expect(ADMIN_COOKIE).toContain('Max-Age=900');
  expect(REFRESH_COOKIE).toContain('refresh=');
  expect(REFRESH_COOKIE).toContain('HttpOnly');
  expect(REFRESH_COOKIE).toContain('Max-Age=2592000');
});

afterAll(() => {
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bearerHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function loginAttempt(password: string) {
  return app.request('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password }),
  }, testEnv);
}

async function loginAs(username: string, password: string): Promise<string> {
  const res = await app.request('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, testEnv);
  expect(res.status).toBe(200);
  return res.headers.get('Set-Cookie') ?? '';
}

function parseLoginCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cookie of res.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

/** Login and capture BOTH HttpOnly cookies (session= + refresh=). */
async function loginFull(username: string, password: string): Promise<Record<string, string>> {
  const res = await app.request('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, testEnv);
  expect(res.status).toBe(200);
  return parseLoginCookies(res);
}

function cookieHeader(cookies: Record<string, string>): string {
  const parts: string[] = [];
  if (cookies.session) parts.push(`session=${cookies.session}`);
  if (cookies.refresh) parts.push(`refresh=${cookies.refresh}`);
  return parts.join('; ');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin API — cookie-based auth', () => {
  it('accepts the session cookie on protected routes', async () => {
    const res = await app.request('/admin/users', { headers: { Cookie: ADMIN_COOKIE } });
    expect(res.status).toBe(200);
  });

  it('omits Secure on plain-HTTP requests (local dev keeps working)', async () => {
    const res = await loginAttempt(ADMIN_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).not.toContain('Secure');
  });

  it('adds Secure when the request is HTTPS (x-forwarded-proto)', async () => {
    const res = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    }, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Secure');
  });

  it('rejects a cookie signed with a different secret', async () => {
    const forged = await createSessionToken(
      { userId: 1, tenantId: TENANT, role: 'admin' },
      'attacker-known-secret-for-forgery!!',
    );
    const res = await app.request('/admin/users', {
      headers: { Cookie: `session=${forged}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an expired session cookie', async () => {
    const expired = await new SignJWT({ userId: 1, tenantId: TENANT, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime('-1m')
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));
    const res = await app.request('/admin/users', {
      headers: { Cookie: `session=${expired}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed cookie', async () => {
    const res = await app.request('/admin/users', {
      headers: { Cookie: 'session=not-a-jwt' },
    });
    expect(res.status).toBe(401);
  });
});

describe('Admin API — per-request DB session check (SR-1)', () => {
  async function insertSessionRow(sid: string, userId: number): Promise<void> {
    await sql`
      INSERT INTO auth_sessions (id, tenant_id, user_id, device_name, expires_at, refresh_hash, lineage_id)
      VALUES (${sid}, ${TENANT}, ${userId}, 'test-client', datetime('now', '+30 days'), ${`hash-${sid}`}, ${crypto.randomUUID()})
    `.execute(db);
  }

  it('rejects a validly-signed token whose session row is missing (401)', async () => {
    const ghost = await createSessionToken(
      { userId: 1, tenantId: TENANT, role: 'admin', sid: crypto.randomUUID() },
      TEST_JWT_SECRET,
    );
    const res = await app.request('/admin/users', { headers: bearerHeaders(ghost) });
    expect(res.status).toBe(401);
  });

  it('rejects a validly-signed token whose session row is revoked (401)', async () => {
    const sid = crypto.randomUUID();
    await insertSessionRow(sid, 1);
    await sql`UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ${sid}`.execute(db);

    const token = await createSessionToken(
      { userId: 1, tenantId: TENANT, role: 'admin', sid },
      TEST_JWT_SECRET,
    );
    const res = await app.request('/admin/users', { headers: bearerHeaders(token) });
    expect(res.status).toBe(401);
  });

  it('rejects a validly-signed token for a deactivated user (401)', async () => {
    const sid = crypto.randomUUID();
    await insertSessionRow(sid, 1);
    const token = await createSessionToken(
      { userId: 1, tenantId: TENANT, role: 'admin', sid },
      TEST_JWT_SECRET,
    );

    await sql`UPDATE users SET is_active = 0 WHERE id = 1`.execute(db);
    try {
      const res = await app.request('/admin/users', { headers: bearerHeaders(token) });
      expect(res.status).toBe(401);
    } finally {
      await sql`UPDATE users SET is_active = 1 WHERE id = 1`.execute(db);
    }
  });

  it('applies role demotion immediately — role comes from the DB, not the JWT (403)', async () => {
    // The token claims 'admin', but the DB row says 'member' → 403.
    await sql`UPDATE users SET role = 'member' WHERE id = 1`.execute(db);
    try {
      const res = await app.request('/admin/users', { headers: bearerHeaders(ADMIN_TOKEN) });
      expect(res.status).toBe(403);
    } finally {
      await sql`UPDATE users SET role = 'admin' WHERE id = 1`.execute(db);
    }
  });
});

describe('Admin API — role boundaries', () => {
  it('member cannot list users (403)', async () => {
    const res = await app.request('/admin/users', { headers: bearerHeaders(MEMBER_TOKEN) });
    expect(res.status).toBe(403);
  });

  it('member cannot manage tokens (403)', async () => {
    const res = await app.request('/admin/tokens', { headers: bearerHeaders(MEMBER_TOKEN) });
    expect(res.status).toBe(403);
  });

  it('member cannot read settings (403)', async () => {
    const res = await app.request('/admin/settings', { headers: bearerHeaders(MEMBER_TOKEN) });
    expect(res.status).toBe(403);
  });

  it('member cookie is rejected on admin-only routes (403)', async () => {
    const memberCookie = await loginAs(MEMBER_USERNAME, MEMBER_PASSWORD);
    const res = await app.request('/admin/users', { headers: { Cookie: memberCookie } });
    expect(res.status).toBe(403);
  });

  it('member can still reach public exempt paths', async () => {
    const res = await app.request('/admin/health', { headers: bearerHeaders(MEMBER_TOKEN) });
    expect(res.status).toBe(200);
  });

  it('admin can manage tokens (200)', async () => {
    const res = await app.request('/admin/tokens', { headers: bearerHeaders(ADMIN_TOKEN) });
    expect(res.status).toBe(200);
  });
});

describe('Admin API — exempt path exact matching', () => {
  it('keeps exact exempt paths public', async () => {
    // Reaches the handler (400: missing body), not blocked by auth.
    const res = await app.request('/admin/auth/login', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('does not exempt routes that merely end with /auth/login', async () => {
    const res = await app.request('/admin/audit/auth/login');
    expect(res.status).toBe(401);
  });

  it('does not exempt routes that end with /health', async () => {
    const res = await app.request('/admin/metrics/health');
    expect(res.status).toBe(401);
  });
});

describe('Admin API — origin check on cookie-authed mutations', () => {
  it('rejects cookie-authed POST from a foreign origin (CSRF)', async () => {
    const res = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE, Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('accepts cookie-authed POST from the same origin', async () => {
    // Fresh session: a successful logout REVOKES the session row (SR-2), so
    // the shared ADMIN_COOKIE must not be consumed here.
    const fresh = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    const res = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookieHeader(fresh), Origin: 'http://localhost' },
    });
    expect(res.status).toBe(200);
  });

  it('leaves Bearer-authed mutations unchecked (not CSRF-able)', async () => {
    // Fresh session: logout now revokes the session row server-side (SR-2).
    const fresh = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    const res = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { ...bearerHeaders(fresh.session), Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(200);
  });

  it('allows GET with a foreign origin (no state change)', async () => {
    const res = await app.request('/admin/users', {
      headers: { Cookie: ADMIN_COOKIE, Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(200);
  });
});

describe('Admin API — logout', () => {
  it('requires a valid session', async () => {
    const res = await app.request('/admin/auth/logout', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('revokes the session row and clears BOTH cookies (Max-Age=0)', async () => {
    // Fresh session: logout consumes it (revoked_at set server-side).
    const fresh = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    expect(fresh.session).toBeTruthy();
    expect(fresh.refresh).toBeTruthy();

    const res = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookieHeader(fresh) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // Both the session= and refresh= cookies are cleared (Max-Age=0).
    const cleared = res.headers.getSetCookie();
    expect(cleared.length).toBe(2);
    const sessionClear = cleared.find((c) => c.startsWith('session='));
    const refreshClear = cleared.find((c) => c.startsWith('refresh='));
    expect(sessionClear).toBeTruthy();
    expect(refreshClear).toBeTruthy();
    for (const c of cleared) {
      expect(c).toContain('HttpOnly');
      expect(c).toContain('Max-Age=0');
      expect(c).toContain('SameSite=Lax');
      expect(c).not.toContain('Secure'); // plain-HTTP test request
    }
  });
});

describe('Admin API — revocation triggers (SR-2)', () => {
  // Replaces the pre-U3 stateless-limitation documentation test. Every
  // trigger (logout, deactivate, demote, password change, device revoke)
  // must kill the affected sessions server-side: the access JWT is rejected
  // on the NEXT request (no TTL wait), the refresh token stops working at
  // /auth/refresh, and other devices keep working (isolation).
  // This describe runs BEFORE the change-password describe so the shared
  // ADMIN_PASSWORD and the beforeAll ADMIN_TOKEN session stay untouched.

  async function memberId(): Promise<number> {
    const row = await sql<{ id: number }>`
      SELECT id FROM users WHERE tenant_id = ${TENANT} AND username = ${MEMBER_USERNAME}
    `.execute(db);
    return Number(row.rows[0].id);
  }

  async function createUser(username: string, role: string, actor: Record<string, string>): Promise<number> {
    const res = await app.request('/admin/users', {
      method: 'POST',
      headers: { Cookie: cookieHeader(actor), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'temp-pass-1234', role }),
    });
    expect(res.status).toBe(201);
    return Number((await res.json() as Record<string, unknown>).id);
  }

  it('logout revokes the session row: next request 401, refresh dead, other device isolated', async () => {
    const deviceA = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    const deviceB = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);

    const logout = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookieHeader(deviceA) },
    });
    expect(logout.status).toBe(200);

    // The revoked row: revoked_at set, row kept for lineage audit (AS-2).
    const { payload } = await jwtVerify(deviceA.session, new TextEncoder().encode(TEST_JWT_SECRET));
    const row = await sql<{ revoked_at: string | null }>`
      SELECT revoked_at FROM auth_sessions WHERE id = ${payload.sid as string}
    `.execute(db);
    expect(row.rows[0].revoked_at).not.toBeNull();

    const afterA = await app.request('/admin/users', { headers: { Cookie: cookieHeader(deviceA) } });
    expect(afterA.status).toBe(401);
    const refreshA = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `refresh=${deviceA.refresh}` },
    });
    expect(refreshA.status).toBe(401);

    // Isolation: the other device keeps working.
    const afterB = await app.request('/admin/users', { headers: { Cookie: cookieHeader(deviceB) } });
    expect(afterB.status).toBe(200);
  });

  // argon2 (64 MB, t=3) dominates these tests: user creation hashes + login
  // verifications. Explicit timeouts so loaded CI machines do not flake.

  it('deactivate (toggle-active) revokes ALL sessions of the target user', async () => {
    const admin = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    const member = await loginFull(MEMBER_USERNAME, MEMBER_PASSWORD);
    const id = await memberId();

    const toggle = await app.request(`/admin/users/${id}/toggle-active`, {
      method: 'POST',
      headers: { Cookie: cookieHeader(admin) },
    });
    expect(toggle.status).toBe(200);
    expect((await toggle.json() as Record<string, unknown>).is_active).toBe(0);

    try {
      // The member's access JWT is now rejected…
      const after = await app.request('/admin/users', { headers: { Cookie: cookieHeader(member) } });
      expect(after.status).toBe(401);
      // …and their refresh token is dead too.
      const refresh = await app.request('/admin/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh=${member.refresh}` },
      });
      expect(refresh.status).toBe(401);
      // Isolation: the admin actor keeps working.
      const adminAfter = await app.request('/admin/users', { headers: { Cookie: cookieHeader(admin) } });
      expect(adminAfter.status).toBe(200);
    } finally {
      // Re-activate so later suites see the member active again.
      await app.request(`/admin/users/${id}/toggle-active`, {
        method: 'POST',
        headers: { Cookie: cookieHeader(admin) },
      });
    }
  }, 30_000);

  it('role demotion (PATCH role) revokes ALL sessions of the target user', async () => {
    const admin = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    const targetId = await createUser('mw-demote', 'admin', admin);
    const target = await loginFull('mw-demote', 'temp-pass-1234');

    const patch = await app.request(`/admin/users/${targetId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieHeader(admin), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'member' }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json() as Record<string, unknown>).role).toBe('member');

    const after = await app.request('/admin/users', { headers: { Cookie: cookieHeader(target) } });
    expect(after.status).toBe(401);
    const refresh = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `refresh=${target.refresh}` },
    });
    expect(refresh.status).toBe(401);
    const adminAfter = await app.request('/admin/users', { headers: { Cookie: cookieHeader(admin) } });
    expect(adminAfter.status).toBe(200);
  }, 30_000);

  it('password change revokes ALL sessions of the user — current included', async () => {
    const admin = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    // Dedicated user: the shared ADMIN_PASSWORD must stay untouched so the
    // change-password describe below keeps working.
    const userId = await createUser('mw-pwuser', 'member', admin);
    const sessA = await loginFull('mw-pwuser', 'temp-pass-1234');
    const sessB = await loginFull('mw-pwuser', 'temp-pass-1234');

    const change = await app.request('/admin/auth/change-password', {
      method: 'POST',
      headers: { Cookie: cookieHeader(sessA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'temp-pass-1234', new_password: 'pw-pass-5678' }),
    });
    expect(change.status).toBe(200);
    expect(await change.json()).toEqual({ success: true });

    // Current session AND the other device are both dead.
    const afterA = await app.request('/admin/users', { headers: { Cookie: cookieHeader(sessA) } });
    expect(afterA.status).toBe(401);
    const afterB = await app.request('/admin/users', { headers: { Cookie: cookieHeader(sessB) } });
    expect(afterB.status).toBe(401);
    // Both refresh tokens are dead too.
    const refreshA = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `refresh=${sessA.refresh}` },
    });
    expect(refreshA.status).toBe(401);
    const refreshB = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `refresh=${sessB.refresh}` },
    });
    expect(refreshB.status).toBe(401);

    // Isolation: the admin actor keeps working.
    const adminAfter = await app.request('/admin/users', { headers: { Cookie: cookieHeader(admin) } });
    expect(adminAfter.status).toBe(200);

    // Old credential rejected; the new one logs in (client must re-login).
    const oldLogin = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mw-pwuser', password: 'temp-pass-1234' }),
    }, testEnv);
    expect(oldLogin.status).toBe(401);
    const newLogin = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mw-pwuser', password: 'pw-pass-5678' }),
    }, testEnv);
    expect(newLogin.status).toBe(200);

    // DB: both pre-change sessions are revoked (current included); the
    // successful re-login above created a fresh active session.
    const rows = await sql<{ id: string; revoked_at: string | null }>`
      SELECT id, revoked_at FROM auth_sessions
      WHERE user_id = ${userId} AND tenant_id = ${TENANT}
      ORDER BY created_at, id
    `.execute(db);
    expect(rows.rows.length).toBe(3); // sessA + sessB + fresh re-login
    expect(rows.rows[0].revoked_at).not.toBeNull();
    expect(rows.rows[1].revoked_at).not.toBeNull();
    expect(rows.rows[2].revoked_at).toBeNull(); // the fresh re-login session
  }, 30_000);

  it('device revoke (DELETE /auth/sessions/:id) kills only that device', async () => {
    const admin = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    const deviceA = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);
    const deviceB = await loginFull(ADMIN_USERNAME, ADMIN_PASSWORD);

    const { payload } = await jwtVerify(deviceA.session, new TextEncoder().encode(TEST_JWT_SECRET));
    const sidA = payload.sid as string;

    const del = await app.request(`/admin/auth/sessions/${sidA}`, {
      method: 'DELETE',
      headers: { Cookie: cookieHeader(admin) },
    });
    expect(del.status).toBe(204);

    const afterA = await app.request('/admin/users', { headers: { Cookie: cookieHeader(deviceA) } });
    expect(afterA.status).toBe(401);
    const refreshA = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `refresh=${deviceA.refresh}` },
    });
    expect(refreshA.status).toBe(401);
    const afterB = await app.request('/admin/users', { headers: { Cookie: cookieHeader(deviceB) } });
    expect(afterB.status).toBe(200);
  });
});

describe('Admin API — change password', () => {
  it('requires authentication', async () => {
    const res = await app.request('/admin/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'x', new_password: 'y'.repeat(8) }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong current password', async () => {
    const res = await app.request('/admin/auth/change-password', {
      method: 'POST',
      headers: bearerHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ current_password: 'wrong-current', new_password: 'brand-new-password' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Current password is incorrect' });
  });

  it('rejects a short new password', async () => {
    const res = await app.request('/admin/auth/change-password', {
      method: 'POST',
      headers: bearerHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ current_password: ADMIN_PASSWORD, new_password: 'short' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'new password must be at least 8 characters',
    });
  });

  it('rejects missing fields', async () => {
    const res = await app.request('/admin/auth/change-password', {
      method: 'POST',
      headers: bearerHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ current_password: ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(400);
  });

  it('changes the password: old credential stops working, new one works', async () => {
    const res = await app.request('/admin/auth/change-password', {
      method: 'POST',
      headers: bearerHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ current_password: ADMIN_PASSWORD, new_password: 'rotated-password' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const oldLogin = await loginAttempt(ADMIN_PASSWORD);
    expect(oldLogin.status).toBe(401);

    const newLogin = await loginAttempt('rotated-password');
    expect(newLogin.status).toBe(200);
  });
});

describe('Admin API — login rate limiting', () => {
  it('blocks attempts beyond 10 per minute per IP+username (429)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await loginAttempt('wrong-password');
      expect(res.status).toBe(401);
    }
    const blocked = await loginAttempt('wrong-password');
    expect(blocked.status).toBe(429);
  });

  it('holds the lockout even for the correct password', async () => {
    const res = await loginAttempt(ADMIN_PASSWORD);
    expect(res.status).toBe(429);
  });
});

describe('createRateLimiter (unit)', () => {
  it('allows up to max hits per window, then blocks', async () => {
    const { createRateLimiter } = await import('../src/admin/rate-limit.js');
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false);
    // Independent keys are not affected.
    expect(limiter.allow('other')).toBe(true);
  });

  it('reset clears the counter (successful login)', async () => {
    const { createRateLimiter } = await import('../src/admin/rate-limit.js');
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    limiter.allow('k');
    limiter.allow('k');
    expect(limiter.allow('k')).toBe(false);
    limiter.reset('k');
    expect(limiter.allow('k')).toBe(true);
  });

  it('expires after the window', async () => {
    const { createRateLimiter } = await import('../src/admin/rate-limit.js');
    const limiter = createRateLimiter({ windowMs: 30, max: 1 });
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(limiter.allow('k')).toBe(true);
  });
});
