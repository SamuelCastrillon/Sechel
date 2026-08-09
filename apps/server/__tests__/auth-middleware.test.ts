import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { SignJWT } from 'jose';
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
    const res = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE, Origin: 'http://localhost' },
    });
    expect(res.status).toBe(200);
  });

  it('leaves Bearer-authed mutations unchecked (not CSRF-able)', async () => {
    const res = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { ...bearerHeaders(ADMIN_TOKEN), Origin: 'https://evil.example' },
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

  it('clears the session cookie (Max-Age=0)', async () => {
    const res = await app.request('/admin/auth/logout', {
      method: 'POST',
      headers: { Cookie: ADMIN_COOKIE },
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('cannot revoke the stateless JWT server-side (documented limitation)', async () => {
    // Logout revokes the BROWSER session by clearing the cookie (Max-Age=0).
    // The stateless JWT itself stays valid until expiry, so a replayed cookie
    // still verifies — full server-side revocation needs a session store and
    // is tracked separately (suspect JD-S-001, out of round scope).
    const res = await app.request('/admin/users', { headers: { Cookie: ADMIN_COOKIE } });
    expect(res.status).toBe(200);
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
