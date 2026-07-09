import 'server-only';
import { createClient, type Client } from '@libsql/client';
import { TENANT_ID } from './index';
import type { UserRow } from './db-types';

// SLICE 1 DEV BYPASS (documented, not a silent no-op):
// Real bearer -> users auth lands in Slice 3. For Slice 1 we seed one admin
// account so the server is usable and parity tests pass. This is a constant
// placeholder credential and MUST be replaced by real auth in Slice 3.
export const DEV_ADMIN_USERNAME = 'dev-admin';
export const DEV_ADMIN_CREDENTIAL_HASH = 'dev-bypass-not-for-production';

/** Seed the dev-admin account if none exists for the tenant. Returns the user row. */
export async function seedAdmin(client: Client): Promise<UserRow> {
  const tenantId = TENANT_ID();
  const existing = await client.execute({
    sql: `SELECT * FROM users WHERE tenant_id = ? AND username = ? LIMIT 1`,
    args: [tenantId, DEV_ADMIN_USERNAME],
  });
  if (existing.rows.length > 0) {
    return existing.rows[0] as unknown as UserRow;
  }
  await client.execute({
    sql: `INSERT INTO users (tenant_id, username, role, credential_hash, created_at)
          VALUES (?, ?, 'admin', ?, datetime('now'))`,
    args: [tenantId, DEV_ADMIN_USERNAME, DEV_ADMIN_CREDENTIAL_HASH],
  });
  const created = await client.execute({
    sql: `SELECT * FROM users WHERE tenant_id = ? AND username = ? LIMIT 1`,
    args: [tenantId, DEV_ADMIN_USERNAME],
  });
  return created.rows[0] as unknown as UserRow;
}
