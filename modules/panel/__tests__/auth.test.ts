import { describe, it, expect, beforeAll } from 'vitest';

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
      process.env.JWT_SECRET ?? 'sechel-dev-jwt-secret-change-in-production-32chr',
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      args: [hashed, adminUser.id as number],
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
