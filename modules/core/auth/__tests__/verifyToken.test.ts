import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import type { Kysely } from 'kysely';
import type { Client } from '@libsql/client';
import type { CortexDB } from '@/modules/core/db/db-types';

const OLD_ENV = { ...process.env };

describe('verifyToken — integration with real DB', () => {
  let client: Client;
  let db: Kysely<CortexDB>;

  beforeEach(async () => {
    process.env = { ...OLD_ENV };
    delete process.env.CORTEXT_DEV_TOKEN;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;

    const t = await createTestDb();
    client = t.client;
    db = t.db;
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('resolves a valid sk_ token to AuthInfo', async () => {
    const { verifyToken } = await import('../index');
    const { generateApiToken } = await import('../tokens');
    const token = generateApiToken();

    const users = await client.execute({
      sql: `SELECT id FROM users WHERE role = 'admin' LIMIT 1`,
    });
    const userId = Number((users.rows[0] as Record<string, unknown>).id);

    await client.execute({
      sql: `INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash)
            VALUES ('default', ?, ?, ?)`,
      args: [userId, token.prefix, token.hash],
    });

    const authInfo = await verifyToken({} as Request, token.raw, db);

    expect(authInfo).toBeDefined();
    expect(authInfo!.extra).toBeDefined();
    const extra = authInfo!.extra as Record<string, unknown>;
    expect(extra.userId).toBe(userId);
    expect(extra.role).toBe('admin');
  });

  it('returns undefined for unknown token', async () => {
    const { verifyToken } = await import('../index');
    const authInfo = await verifyToken({} as Request, 'some-unknown-token', db);
    expect(authInfo).toBeUndefined();
  });

  it('returns undefined for inactive user token', async () => {
    const { verifyToken } = await import('../index');
    const { generateApiToken } = await import('../tokens');
    const token = generateApiToken();

    await client.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active)
            VALUES ('default', 'inactive-user', 'member', 'hash', 0)`,
    });
    const users = await client.execute({
      sql: `SELECT id FROM users WHERE username = 'inactive-user' LIMIT 1`,
    });
    const userId = Number((users.rows[0] as Record<string, unknown>).id);

    await client.execute({
      sql: `INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash)
            VALUES ('default', ?, ?, ?)`,
      args: [userId, token.prefix, token.hash],
    });

    const authInfo = await verifyToken({} as Request, token.raw, db);
    expect(authInfo).toBeUndefined();
  });
});

describe('verifyToken — dev bypass', () => {
  let db: Kysely<CortexDB>;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('dev bypass active when CORTEXT_DEV_TOKEN is set', async () => {
    process.env.CORTEXT_DEV_TOKEN = 'mydevpass';
    const t = await createTestDb();
    db = t.db;
    const { verifyToken } = await import('../index');

    const authInfo = await verifyToken({} as Request, 'mydevpass', db);
    expect(authInfo).toBeDefined();
    expect((authInfo!.extra as Record<string, unknown>).role).toBe('admin');
  });

  it('dev bypass OFF when CORTEXT_DEV_TOKEN is unset', async () => {
    delete process.env.CORTEXT_DEV_TOKEN;
    const t = await createTestDb();
    db = t.db;
    const { verifyToken } = await import('../index');

    const authInfo = await verifyToken({} as Request, 'any-token', db);
    expect(authInfo).toBeUndefined();
  });

  it('dev bypass OFF when CORTEXT_DEV_TOKEN is empty', async () => {
    process.env.CORTEXT_DEV_TOKEN = '';
    const t = await createTestDb();
    db = t.db;
    const { verifyToken } = await import('../index');

    const authInfo = await verifyToken({} as Request, 'any-token', db);
    expect(authInfo).toBeUndefined();
  });

  it('dev bypass with wrong token returns undefined', async () => {
    process.env.CORTEXT_DEV_TOKEN = 'mydevpass';
    const t = await createTestDb();
    db = t.db;
    const { verifyToken } = await import('../index');

    const authInfo = await verifyToken({} as Request, 'wrong-token', db);
    expect(authInfo).toBeUndefined();
  });
});

describe('bootstrapAdminFromEnv', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('bootstrap creates admin when ADMIN_USERNAME/PASSWORD are set', async () => {
    process.env.ADMIN_USERNAME = 'env-admin';
    process.env.ADMIN_PASSWORD = 'env-admin-pass';

    const { bootstrapAdminFromEnv } = await import('../index');
    const { createClient } = await import('@libsql/client');
    const { runMigrations } = await import('@/modules/core/db/migrations');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { randomUUID } = await import('node:crypto');

    const url = `file:${join(tmpdir(), `cortext-test-bootstrap-${randomUUID()}.turso`)}`;
    const testClient = createClient({ url });
    await runMigrations(testClient);

    await bootstrapAdminFromEnv(testClient);

    const users = await testClient.execute({
      sql: `SELECT username, role, is_active FROM users WHERE role = 'admin'`,
    });
    expect(users.rows.length).toBe(1);
    expect((users.rows[0] as Record<string, unknown>).username).toBe('env-admin');
    expect((users.rows[0] as Record<string, unknown>).is_active).toBe(1);
  });
});
