import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { runMigrations } from '../src/domain/migrations';
import { seedAdmin } from '../src/domain/seed';
import { generateApiToken } from '../src/tokens';
import type { Kysely } from 'kysely';
import type { Client } from '@libsql/client';
import type { CortexDB } from '../src/types';

const TENANT_ID = 'test-tenant';

async function createTestDb(): Promise<{ db: Kysely<CortexDB>; client: Client }> {
  const url = ':memory:';
  const client = createClient({ url });
  await runMigrations(client);
  await seedAdmin(client, TENANT_ID, {
    username: 'test-admin',
    password: 'test-password-for-tests',
  });

  // Import Kysely + LibsqlDialect lazily to avoid top-level side effects
  const { Kysely } = await import('kysely');
  const { LibsqlDialect } = await import('kysely-libsql');
  const db = new Kysely<CortexDB>({
    dialect: new LibsqlDialect({ client }),
  });

  return { db, client };
}

describe('verifyToken with explicit db', () => {
  let client: Client;
  let db: Kysely<CortexDB>;

  beforeEach(async () => {
    const t = await createTestDb();
    client = t.client;
    db = t.db;
  });

  it('resolves a valid sk_ token to AuthInfo', async () => {
    const { verifyToken } = await import('../src/auth');
    const token = generateApiToken();

    const users = await client.execute({
      sql: `SELECT id FROM users WHERE role = 'admin' LIMIT 1`,
    });
    const userId = Number((users.rows[0] as Record<string, unknown>).id);

    await client.execute({
      sql: `INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash)
            VALUES (?, ?, ?, ?)`,
      args: [TENANT_ID, userId, token.prefix, token.hash],
    });

    const authInfo = await verifyToken(token.raw, db, TENANT_ID);

    expect(authInfo).toBeDefined();
    expect(authInfo!.extra).toBeDefined();
    const extra = authInfo!.extra as Record<string, unknown>;
    expect(extra.userId).toBe(userId);
    expect(extra.role).toBe('admin');
  });

  it('returns undefined for missing/undefined token', async () => {
    const { verifyToken } = await import('../src/auth');
    const authInfo = await verifyToken(undefined, db, TENANT_ID);
    expect(authInfo).toBeUndefined();
  });

  it('returns undefined for empty string token', async () => {
    const { verifyToken } = await import('../src/auth');
    const authInfo = await verifyToken('', db, TENANT_ID);
    expect(authInfo).toBeUndefined();
  });

  it('returns undefined for unknown/invalid token', async () => {
    const { verifyToken } = await import('../src/auth');
    const authInfo = await verifyToken('some-unknown-token', db, TENANT_ID);
    expect(authInfo).toBeUndefined();
  });

  it('returns undefined for inactive user token', async () => {
    const { verifyToken } = await import('../src/auth');
    const token = generateApiToken();

    await client.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active)
            VALUES (?, ?, 'member', 'hash', 0)`,
      args: [TENANT_ID, 'inactive-user'],
    });
    const users = await client.execute({
      sql: `SELECT id FROM users WHERE username = 'inactive-user' LIMIT 1`,
    });
    const userId = Number((users.rows[0] as Record<string, unknown>).id);

    await client.execute({
      sql: `INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash)
            VALUES (?, ?, ?, ?)`,
      args: [TENANT_ID, userId, token.prefix, token.hash],
    });

    const authInfo = await verifyToken(token.raw, db, TENANT_ID);
    expect(authInfo).toBeUndefined();
  });

  it('does not cross tenant boundaries', async () => {
    const { verifyToken } = await import('../src/auth');
    const token = generateApiToken();

    const users = await client.execute({
      sql: `SELECT id FROM users WHERE role = 'admin' LIMIT 1`,
    });
    const userId = Number((users.rows[0] as Record<string, unknown>).id);

    // Insert token under test-tenant
    await client.execute({
      sql: `INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash)
            VALUES (?, ?, ?, ?)`,
      args: [TENANT_ID, userId, token.prefix, token.hash],
    });

    // Verify with a DIFFERENT tenant ID
    const authInfo = await verifyToken(token.raw, db, 'other-tenant');
    expect(authInfo).toBeUndefined();
  });
});
