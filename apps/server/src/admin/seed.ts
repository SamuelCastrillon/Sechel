import type { Client } from '@libsql/client';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { CortexDB, UserRow } from '@sechel-mcp/core';
import { hashPassword } from './auth.js';

/**
 * Bootstrap the admin user from ADMIN_USERNAME/ADMIN_PASSWORD env vars.
 *
 * Idempotent: if the user already exists, it updates the credential_hash.
 * Accepts optional explicit credentials for tests.
 */
export async function seedAdmin(
  client: Client,
  tenantId: string,
  credentials?: { username: string; password: string },
): Promise<UserRow | undefined> {
  const adminUsername = credentials?.username ?? process.env.ADMIN_USERNAME;
  const adminPassword = credentials?.password ?? process.env.ADMIN_PASSWORD;

  if (adminUsername && adminPassword) {
    const existing = await client.execute({
      sql: `SELECT id, credential_hash FROM users WHERE tenant_id = ? AND username = ?`,
      args: [tenantId, adminUsername],
    });

    const hash = await hashPassword(adminPassword);

    if (existing.rows.length > 0) {
      await client.execute({
        sql: `UPDATE users SET credential_hash = ? WHERE tenant_id = ? AND username = ?`,
        args: [hash, tenantId, adminUsername],
      });
    } else {
      await client.execute({
        sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
              VALUES (?, ?, 'admin', ?, 1, datetime('now'))`,
        args: [tenantId, adminUsername, hash],
      });
    }
  } else {
    console.warn(
      '[seedAdmin] ADMIN_USERNAME/ADMIN_PASSWORD not set. ' +
      'The admin panel login will not work until configured.',
    );
  }

  const regSetting = await client.execute({
    sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
  });
  if (regSetting.rows.length === 0) {
    await client.execute({
      sql: `INSERT INTO instance_settings (key, value, updated_at) VALUES ('registration_enabled', '0', datetime('now'))`,
    });
  }

  const admin = await client.execute({
    sql: `SELECT * FROM users WHERE tenant_id = ? AND role = 'admin' ORDER BY username ASC LIMIT 1`,
    args: [tenantId],
  });
  return admin.rows[0] as unknown as UserRow | undefined;
}

/**
 * Seed the first admin from credentials when no user with that username
 * exists yet.
 *
 * Create-only: unlike `seedAdmin`, it never overwrites an existing
 * credential_hash, so DB-side password changes survive restarts. Used by
 * hosts that resolve ADMIN_* from runtime bindings instead of process.env
 * (e.g. the embedded panel on Cloudflare).
 */
export async function seedAdminFromDb(
  db: Kysely<CortexDB>,
  tenantId: string,
  credentials?: { username: string; password: string },
): Promise<UserRow | undefined> {
  const adminUsername = credentials?.username;
  const adminPassword = credentials?.password;

  if (!adminUsername || !adminPassword) return undefined;

  const existing = await sql<{ id: number }>`
    SELECT id FROM users WHERE tenant_id = ${tenantId} AND username = ${adminUsername}
  `.execute(db);
  if (existing.rows.length === 0) {
    const hash = await hashPassword(adminPassword);
    await sql`
      INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
      VALUES (${tenantId}, ${adminUsername}, 'admin', ${hash}, 1, datetime('now'))
    `.execute(db);
  }

  const regSetting = await sql<{ value: string }>`
    SELECT value FROM instance_settings WHERE key = 'registration_enabled'
  `.execute(db);
  if (regSetting.rows.length === 0) {
    await sql`
      INSERT INTO instance_settings (key, value, updated_at)
      VALUES ('registration_enabled', '0', datetime('now'))
    `.execute(db);
  }

  const admin = await sql<UserRow>`
    SELECT * FROM users WHERE tenant_id = ${tenantId} AND role = 'admin'
    ORDER BY username ASC LIMIT 1
  `.execute(db);
  return admin.rows[0];
}
