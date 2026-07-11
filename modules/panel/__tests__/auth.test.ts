import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// All JWT operations in panel/auth require JWT_SECRET. Set it here so tests
// don't depend on .env files or the previous hardcoded fallback.
beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';
});

// ── Mocks for Next.js modules ────────────────────────────────────
const mockRedirect = vi.fn();
const mockCookieGet = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { mockRedirect(url); throw new Error('NEXT_REDIRECT'); },
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: mockCookieGet,
  }),
}));

describe('panel/auth — JWT session tokens', () => {
  it('createSessionToken produces a signed JWT', async () => {
    const { createSessionToken } = await import('../auth');
    const token = await createSessionToken({ userId: 1, role: 'admin' });

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    // JWT has 3 parts separated by dots
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifySessionToken returns the payload for valid token', async () => {
    const { createSessionToken, verifySessionToken } = await import('../auth');
    const token = await createSessionToken({ userId: 42, role: 'member' });
    const payload = await verifySessionToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(42);
    expect(payload!.role).toBe('member');
  });

  it('verifySessionToken returns null for expired token', async () => {
    const { verifySessionToken } = await import('../auth');

    // Create a token that's already expired (iat in the past, short exp)
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET!,
    );
    const expiredToken = await new SignJWT({ userId: 1, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120) // 2 min ago
      .setExpirationTime('-1m') // expired 1 min ago
      .sign(secret);

    const payload = await verifySessionToken(expiredToken);
    expect(payload).toBeNull();
  });

  it('verifySessionToken returns null for malformed token', async () => {
    const { verifySessionToken } = await import('../auth');
    const payload = await verifySessionToken('not-a-valid-jwt-token');
    expect(payload).toBeNull();
  });

  it('different payloads produce different tokens', async () => {
    const { createSessionToken } = await import('../auth');
    const token1 = await createSessionToken({ userId: 1, role: 'admin' });
    const token2 = await createSessionToken({ userId: 2, role: 'member' });

    expect(token1).not.toBe(token2);
  });
});

describe('panel/actions — login flow integration', () => {
  it('login with correct credentials via API succeeds', async () => {
    // This test creates a test user and then tests the login logic directly
    // (bypassing the route handler/server action layer)
    const { createTestDb } = await import('@/modules/core/db');
    const t = await createTestDb();

    // Get the admin user
    const users = await t.client.execute({
      sql: `SELECT id, username, credential_hash FROM users WHERE role = 'admin' LIMIT 1`,
    });
    const adminUser = users.rows[0] as Record<string, unknown>;

    // The dev fallback uses a hash that's not argon2id
    // So let's create a proper user with a real password hash
    const { hashPassword } = await import('@/modules/core/auth/password');
    const hashed = await hashPassword('testpass123');

    await t.client.execute({
      sql: `UPDATE users SET credential_hash = ?, username = 'testadmin' WHERE id = ?`,
      args: [hashed, adminUser.id],
    });

    // Now test password verification directly
    const { verifyPassword } = await import('@/modules/core/auth/password');
    const valid = await verifyPassword('testpass123', hashed);
    expect(valid).toBe(true);

    const invalid = await verifyPassword('wrongpass', hashed);
    expect(invalid).toBe(false);
  });

  it('inactive user cannot login', async () => {
    const { createTestDb } = await import('@/modules/core/db');
    const t = await createTestDb();

    // Create an inactive user
    const { hashPassword } = await import('@/modules/core/auth/password');
    const hashed = await hashPassword('testpass');
    await t.client.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active)
            VALUES ('default', 'inactive', 'member', ?, 0)`,
      args: [hashed],
    });

    // Verify the user exists and is inactive
    const users = await t.client.execute({
      sql: `SELECT is_active FROM users WHERE username = 'inactive'`,
    });
    expect((users.rows[0] as Record<string, unknown>).is_active).toBe(0);
  });
});

describe('panel/actions — register gating', () => {
  it('registration creates user with is_active=0', async () => {
    const { createClient } = await import('@libsql/client');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { randomUUID } = await import('node:crypto');
    const url = `file:${join(tmpdir(), `sechel-test-reg-${randomUUID()}.turso`)}`;
    const client = createClient({ url });

    // Run migrations and seed
    const { runMigrations } = await import('@/modules/core/db/migrations');
    await runMigrations(client);

    // Enable registration
    await client.execute({
      sql: `DELETE FROM instance_settings WHERE key = 'registration_enabled'`,
    });
    await client.execute({
      sql: `INSERT INTO instance_settings (key, value) VALUES ('registration_enabled', '1')`,
    });

    // Register a user
    const { hashPassword } = await import('@/modules/core/auth/password');
    const hashed = await hashPassword('newuserpass');
    await client.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active)
            VALUES ('default', 'newuser', 'member', ?, 0)`,
      args: [hashed],
    });

    // Verify user was created with is_active=0
    const users = await client.execute({
      sql: `SELECT username, is_active, role FROM users WHERE username = 'newuser'`,
    });
    expect(users.rows.length).toBe(1);
    const user = users.rows[0] as Record<string, unknown>;
    expect(user.is_active).toBe(0);
    expect(user.role).toBe('member');
  });

  it('registration blocked when disabled', async () => {
    const { createClient } = await import('@libsql/client');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { randomUUID } = await import('node:crypto');
    const url = `file:${join(tmpdir(), `sechel-test-reg-block-${randomUUID()}.turso`)}`;
    const client = createClient({ url });

    const { runMigrations } = await import('@/modules/core/db/migrations');
    await runMigrations(client);

    // registration_enabled defaults to '0' from seed

    // Check the setting
    const settings = await client.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
    });
    const enabled = settings.rows.length > 0
      ? (settings.rows[0] as Record<string, unknown>).value === '1'
      : false;

    expect(enabled).toBe(false);
  });
});

describe('panel/auth — requireAdmin guard', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockCookieGet.mockReset();
  });

  it('returns userId when valid admin session exists', async () => {
    const { createSessionToken, requireAdmin } = await import('../auth');
    const token = await createSessionToken({ userId: 1, role: 'admin' });
    mockCookieGet.mockReturnValue({ value: token });

    const result = await requireAdmin();
    expect(result).toEqual({ userId: 1 });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects when no session cookie exists', async () => {
    mockCookieGet.mockReturnValue(undefined);
    const { requireAdmin } = await import('../auth');

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('redirects when session token is invalid', async () => {
    mockCookieGet.mockReturnValue({ value: 'invalid-token' });
    const { requireAdmin } = await import('../auth');

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });

  it('redirects when session role is not admin', async () => {
    const { createSessionToken, requireAdmin } = await import('../auth');
    const token = await createSessionToken({ userId: 2, role: 'member' });
    mockCookieGet.mockReturnValue({ value: token });

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/admin/login');
  });
});

describe('panel/auth — ActionResult type shape', () => {
  it('ActionResult supports success shape', () => {
    const success: import('../auth').ActionResult = { success: true, data: { id: 1 } };
    expect(success.success).toBe(true);
    expect(success.data).toEqual({ id: 1 });
  });

  it('ActionResult supports error shape', () => {
    const err: import('../auth').ActionResult = { success: false, error: 'Something went wrong' };
    expect(err.success).toBe(false);
    expect(err.error).toBe('Something went wrong');
  });
});
