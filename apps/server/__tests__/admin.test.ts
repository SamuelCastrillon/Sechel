import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import type { Env } from '../src/index.js';
import { createSessionToken, verifyPassword } from '../src/admin/auth.js';
import { seedAdminFromDb } from '../src/admin/seed.js';

// ---------------------------------------------------------------------------
// Setup: temp SQLite DB, seed admin, create shared Kysely instance
// ---------------------------------------------------------------------------

const TEST_DB_PATH = join(tmpdir(), `sechel-test-admin-${Date.now()}.db`);
const TEST_JWT_SECRET = 'test-secret-key-for-admin-tests';
const ADMIN_USERNAME = 'test-admin';
const ADMIN_PASSWORD = 'test-password';

let db: Kysely<CortexDB>;
let app: Hono<{ Bindings: Env }>;
let testEnv: Env;

let ADMIN_TOKEN: string;

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  // Step 1: Create raw client, run migrations, seed admin
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: `file:${TEST_DB_PATH}` });
  const { runMigrations } = await import('@sechel-mcp/core');
  await runMigrations(client);
  const { seedAdmin } = await import('../src/admin/seed.js');
  await seedAdmin(client, 'test', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  client.close();

  // Step 2: Create shared Kysely instance
  const { createDb } = await import('@sechel-mcp/core');
  db = await createDb({ url: `file:${TEST_DB_PATH}` });

  // Step 3: Create a DB-backed admin session token for protected route tests.
  // The access JWT carries a sid claim and the middleware re-validates the
  // session row on every request (SR-1), so a row must exist.
  const adminSid = crypto.randomUUID();
  await sql`
    INSERT INTO auth_sessions (id, tenant_id, user_id, device_name, expires_at, refresh_hash, lineage_id)
    VALUES (${adminSid}, 'test', 1, 'test-client', datetime('now', '+30 days'), ${`hash-${adminSid}`}, ${crypto.randomUUID()})
  `.execute(db);
  ADMIN_TOKEN = await createSessionToken(
    { userId: 1, tenantId: 'test', role: 'admin', sid: adminSid },
    TEST_JWT_SECRET,
  );

  testEnv = {
    DATABASE_URL: `file:${TEST_DB_PATH}`,
    TENANT_ID: 'test',
  };

  // Step 4: Create the Hono app with shared DB and custom JWT secret
  const mod = await import('../src/index.js');
  app = mod.createApp({ db, jwtSecret: TEST_JWT_SECRET });
});

afterAll(() => {
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin API — Health', () => {
  it('GET /admin/health returns 200 with status ok', async () => {
    const res = await app.request('/admin/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(typeof body.time).toBe('number');
  });
});

describe('Admin API — Login', () => {
  it('POST /admin/auth/login returns 400 when body is missing', async () => {
    const res = await app.request('/admin/auth/login', { method: 'POST' }, testEnv);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'username and password are required' });
  });

  it('POST /admin/auth/login returns 400 when fields missing', async () => {
    const res = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test' }),
    }, testEnv);
    expect(res.status).toBe(400);
  });

  it('POST /admin/auth/login returns 401 for wrong password', async () => {
    const res = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: 'wrong' }),
    }, testEnv);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });
  });

  it('POST /admin/auth/login returns 200 + token + Set-Cookie for valid creds', async () => {
    const res = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    }, testEnv);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.token).toBe('string');
    expect(body.token).toBeTruthy();
    expect(typeof body.refresh_token).toBe('string'); // NC-1: cookie-less clients
    expect(body.user).toEqual({ id: 1, username: ADMIN_USERNAME, role: 'admin' });

    // Two cookies: 15-min session + 30-day refresh (RT-1/RT-2, NC-1).
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.length).toBe(2);

    const sessionCookie = setCookies[0];
    expect(sessionCookie).toContain('session=');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).toContain('Max-Age=900');
    expect(sessionCookie).toContain('SameSite=Lax');

    const refreshCookie = setCookies[1];
    expect(refreshCookie).toContain('refresh=');
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/');
    expect(refreshCookie).toContain('Max-Age=2592000');
    expect(refreshCookie).toContain('SameSite=Lax');
  });

  it('POST /admin/auth/login returns 401 for inactive account (no existence leak)', async () => {
    // Deactivate the admin temporarily
    await sql`UPDATE users SET is_active = 0 WHERE username = ${ADMIN_USERNAME}`.execute(db);

    const res = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    }, testEnv);
    // Must return 401 (same as wrong password) — no 403 to avoid user enumeration
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });

    // Reactivate
    await sql`UPDATE users SET is_active = 1 WHERE username = ${ADMIN_USERNAME}`.execute(db);
  });
});

describe('Admin API — Auth Middleware', () => {
  it('returns 401 for protected route without token', async () => {
    const res = await app.request('/admin/users');
    expect(res.status).toBe(401);
  });

  it('returns 401 for protected route with invalid token', async () => {
    const res = await app.request('/admin/users', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 for protected route with valid token', async () => {
    const res = await app.request('/admin/users', {
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(200);
  });

  it('allows access to exempt paths without token', async () => {
    const res = await app.request('/admin/health');
    expect(res.status).toBe(200);
  });
});

describe('Admin API — Users CRUD', () => {
  let createdUserId: number;

  it('POST /admin/users creates a new user (201)', async () => {
    const res = await app.request('/admin/users', {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({
        username: 'newuser',
        password: 'newpass123',
        role: 'member',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.username).toBe('newuser');
    expect(body.role).toBe('member');
    expect(body.is_active).toBe(1);
    expect(typeof body.id).toBe('number');
    createdUserId = body.id as number;
  });

  it('POST /admin/users returns 409 for duplicate username', async () => {
    const res = await app.request('/admin/users', {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({
        username: 'newuser',
        password: 'newpass456',
        role: 'admin',
      }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Username already exists' });
  });

  it('POST /admin/users returns 400 for missing fields', async () => {
    const res = await app.request('/admin/users', {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ username: 'partial' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /admin/users lists all users', async () => {
    const res = await app.request('/admin/users', {
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { users: Array<Record<string, unknown>> };
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThanOrEqual(2);

    const admin = body.users.find((u: Record<string, unknown>) => u.username === ADMIN_USERNAME);
    expect(admin).toBeTruthy();
    expect(admin!.role).toBe('admin');
    expect(admin!.is_active).toBe(1);
    // Should not expose credential_hash
    expect(admin!.credential_hash).toBeUndefined();
  });

  it('PATCH /admin/users/:id updates user role', async () => {
    const res = await app.request(`/admin/users/${createdUserId}`, {
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.role).toBe('admin');
  });

  it('PATCH /admin/users/:id returns 404 for non-existent user', async () => {
    const res = await app.request('/admin/users/99999', {
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /admin/users/:id/toggle-active toggles is_active', async () => {
    // Toggle to inactive
    const res1 = await app.request(`/admin/users/${createdUserId}/toggle-active`, {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as Record<string, unknown>;
    expect(body1.is_active).toBe(0);

    // Toggle back to active
    const res2 = await app.request(`/admin/users/${createdUserId}/toggle-active`, {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as Record<string, unknown>;
    expect(body2.is_active).toBe(1);
  });

  it('POST /admin/users/:id/toggle-active returns 404 for non-existent user', async () => {
    const res = await app.request('/admin/users/99999/toggle-active', {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(404);
  });

  it('POST /admin/users/:id/permissions sets project permission', async () => {
    const res = await app.request(`/admin/users/${createdUserId}/permissions`, {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ project: 'test-project', permission: 'read' }),
    });
    expect(res.status).toBe(204);
  });

  it('POST /admin/users/:id/permissions returns 400 for invalid permission', async () => {
    const res = await app.request(`/admin/users/${createdUserId}/permissions`, {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ project: 'test-project', permission: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /admin/users/:id/permissions with none removes the row', async () => {
    const res = await app.request(`/admin/users/${createdUserId}/permissions`, {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ project: 'test-project', permission: 'none' }),
    });
    expect(res.status).toBe(204);

    // Verify the row is gone
    const check = await sql`SELECT id FROM user_project_access WHERE user_id = ${createdUserId} AND project = 'test-project'`.execute(db);
    expect(check.rows.length).toBe(0);
  });

  it('POST /admin/users/:id/permissions returns 404 for non-existent user', async () => {
    const res = await app.request('/admin/users/99999/permissions', {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ project: 'p', permission: 'read' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('Admin API — Settings', () => {
  it('GET /admin/settings returns settings as key-value object', async () => {
    const res = await app.request('/admin/settings', {
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, string>;
    expect(typeof body).toBe('object');
    // registration_enabled is seeded by seedAdmin
    expect(body).toHaveProperty('registration_enabled');
  });

  it('PATCH /admin/settings updates allowed key', async () => {
    const res = await app.request('/admin/settings', {
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ registration_enabled: '1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, string>;
    expect(body.registration_enabled).toBe('1');
  });

  it('PATCH /admin/settings returns 400 for unknown key', async () => {
    const res = await app.request('/admin/settings', {
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ unknown_key: 'value' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown setting key: unknown_key' });
  });

  it('PATCH /admin/settings with empty body does not error', async () => {
    const res = await app.request('/admin/settings', {
      method: 'PATCH',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });
});

describe('Admin API — Tokens CRUD', () => {
  let createdTokenId: number;
  let rawToken: string;

  it('POST /admin/tokens creates a token and returns raw', async () => {
    const res = await app.request('/admin/tokens', {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
      body: JSON.stringify({ description: 'test token' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('number');
    expect(typeof body.raw).toBe('string');
    expect(body.raw).toMatch(/^[0-9a-f]{80}$/); // 40 bytes hex = 80 chars
    expect(body.prefix).toMatch(/^sk_/);
    expect(body.description).toBe('test token');
    expect(body).not.toHaveProperty('hash');

    createdTokenId = body.id as number;
    rawToken = body.raw as string;
  });

  it('POST /admin/tokens works without description', async () => {
    const res = await app.request('/admin/tokens', {
      method: 'POST',
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.description).toBeNull();
  });

  it('GET /admin/tokens lists tokens without hash/raw', async () => {
    const res = await app.request('/admin/tokens', {
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { tokens: Array<Record<string, unknown>> };
    expect(Array.isArray(body.tokens)).toBe(true);
    expect(body.tokens.length).toBeGreaterThanOrEqual(1);

    const found = body.tokens.find((t: Record<string, unknown>) => t.id === createdTokenId);
    expect(found).toBeTruthy();
    expect(found!.prefix).toMatch(/^sk_/);
    expect(found!.description).toBe('test token');
    // Must not expose hash or raw
    expect(found!.hash).toBeUndefined();
    expect(found!.raw).toBeUndefined();
  });

  it('DELETE /admin/tokens/:id removes token', async () => {
    const res = await app.request(`/admin/tokens/${createdTokenId}`, {
      method: 'DELETE',
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(204);

    // Verify it's gone
    const list = await app.request('/admin/tokens', {
      headers: authHeaders(ADMIN_TOKEN),
    });
    const listBody = await list.json() as { tokens: Array<Record<string, unknown>> };
    const found = listBody.tokens.find((t: Record<string, unknown>) => t.id === createdTokenId);
    expect(found).toBeUndefined();
  });

  it('DELETE /admin/tokens/:id returns 404 for non-existent token', async () => {
    const res = await app.request('/admin/tokens/99999', {
      method: 'DELETE',
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /admin/tokens/:id returns 400 for invalid id', async () => {
    const res = await app.request('/admin/tokens/abc', {
      method: 'DELETE',
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(res.status).toBe(400);
  });
});

describe('Admin API — Route prefix support', () => {
  it('works with custom prefix', async () => {
    const mod = await import('../src/index.js');
    const prefixedApp = mod.createApp({ db, jwtSecret: TEST_JWT_SECRET, prefix: '/api/admin' });

    const res = await prefixedApp.request('/api/admin/health');
    expect(res.status).toBe(200);
    expect((await res.json())).toHaveProperty('status', 'ok');

    // Protected route works with token
    const usersRes = await prefixedApp.request('/api/admin/users', {
      headers: authHeaders(ADMIN_TOKEN),
    });
    expect(usersRes.status).toBe(200);
  });
});

describe('Admin API — Registration', () => {
  const register = (body: Record<string, unknown>) =>
    app.request(
      '/admin/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      testEnv,
    );

  it('is accessible without a token (public, exempt path)', async () => {
    const res = await app.request('/admin/auth/register', { method: 'POST' }, testEnv);
    // Reached the handler (not blocked by auth middleware): 400 because no body.
    expect(res.status).toBe(400);
  });

  it('returns 403 when registration is disabled', async () => {
    await sql`
      INSERT INTO instance_settings (key, value)
      VALUES ('registration_enabled', '0')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `.execute(db);

    const res = await register({ username: 'reguser1', password: 'password123' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Registration is disabled' });
  });

  it('returns 201 and creates a pending (is_active=0) member when enabled', async () => {
    await sql`
      INSERT INTO instance_settings (key, value)
      VALUES ('registration_enabled', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `.execute(db);

    const res = await register({ username: 'reguser2', password: 'password123' });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.username).toBe('reguser2');
    expect(body.role).toBe('member');
    expect(body.is_active).toBe(0);
    expect(typeof body.id).toBe('number');
  });

  it('returns 409 for duplicate username', async () => {
    const res = await register({ username: 'reguser2', password: 'password123' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Username already exists' });
  });

  it('returns 400 for a password shorter than 8 characters', async () => {
    const res = await register({ username: 'reguser3', password: 'short' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'password must be at least 8 characters',
    });
  });

  it('returns 400 when fields are missing', async () => {
    const res = await register({ username: 'reguser4' });
    expect(res.status).toBe(400);
  });

  it('does NOT auto-login (no Set-Cookie) on success', async () => {
    const res = await register({ username: 'reguser5', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('GET /admin/public/registration-enabled reflects the setting', async () => {
    await sql`
      INSERT INTO instance_settings (key, value)
      VALUES ('registration_enabled', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `.execute(db);
    const on = await app.request('/admin/public/registration-enabled', {}, testEnv);
    expect(on.status).toBe(200);
    expect((await on.json())).toEqual({ enabled: true });

    await sql`
      UPDATE instance_settings SET value = '0' WHERE key = 'registration_enabled'
    `.execute(db);
    const off = await app.request('/admin/public/registration-enabled', {}, testEnv);
    expect(off.status).toBe(200);
    expect((await off.json())).toEqual({ enabled: false });
  });
});

describe('Admin API — seedAdminFromDb (embedded create-only seeding)', () => {
  it('creates the first admin when missing', async () => {
    const first = await seedAdminFromDb(db, 'seedtest', {
      username: 'seed-admin',
      password: 'first-password',
    });
    expect(first?.username).toBe('seed-admin');
    expect(first?.role).toBe('admin');
    expect(first?.is_active).toBe(1);
  });

  it('never overwrites an existing credential_hash (create-only)', async () => {
    // "Cold start" with a different ADMIN_PASSWORD must not re-hash.
    await seedAdminFromDb(db, 'seedtest', {
      username: 'seed-admin',
      password: 'second-password',
    });
    const row = await sql<{ credential_hash: string }>`
      SELECT credential_hash FROM users
      WHERE tenant_id = 'seedtest' AND username = 'seed-admin'
    `.execute(db);
    expect(await verifyPassword('first-password', row.rows[0].credential_hash)).toBe(true);
    expect(await verifyPassword('second-password', row.rows[0].credential_hash)).toBe(false);
  });

  it('ensures the registration_enabled setting exists', async () => {
    await seedAdminFromDb(db, 'seedtest-other', { username: 'other-admin', password: 'other-pass' });
    const reg = await sql<{ value: string }>`
      SELECT value FROM instance_settings WHERE key = 'registration_enabled'
    `.execute(db);
    expect(reg.rows.length).toBe(1);
  });

  it('no-ops when credentials are missing', async () => {
    const result = await seedAdminFromDb(db, 'seedtest-nocreds');
    expect(result).toBeUndefined();
  });
});

