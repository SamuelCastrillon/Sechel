import 'server-only';
import type { Client } from '@libsql/client';
import { TENANT_ID } from './index';
import type { UserRow } from './db-types';
import { hashPassword } from '../auth/password';

/**
 * Bootstrap the admin user from ADMIN_USERNAME/ADMIN_PASSWORD env vars.
 *
 * Idempotent: if the user already exists, it updates the credential_hash
 * (so changing .env re-hashes on next server restart). If env vars are not
 * set, it logs a warning and does NOT create a fallback user.
 *
 * Accepts optional explicit credentials (used by createTestDb) so tests
 * don't depend on process.env.
 */
export async function seedAdmin(
  client: Client,
  credentials?: { username: string; password: string },
): Promise<UserRow | undefined> {
  const tenantId = TENANT_ID();
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

  // Seed default instance_settings if not present
  const regSetting = await client.execute({
    sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
  });
  if (regSetting.rows.length === 0) {
    await client.execute({
      sql: `INSERT INTO instance_settings (key, value, updated_at) VALUES ('registration_enabled', '0', datetime('now'))`,
    });
  }

  // Return the first admin user (alphabetically first username for determinism)
  const admin = await client.execute({
    sql: `SELECT * FROM users WHERE tenant_id = ? AND role = 'admin' ORDER BY username ASC LIMIT 1`,
    args: [tenantId],
  });
  return admin.rows[0] as unknown as UserRow | undefined;
}
