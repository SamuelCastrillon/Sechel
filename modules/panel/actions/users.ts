'use server';

import { type Client } from '@libsql/client';
import { TENANT_ID } from '@/modules/core/db';
import { withAdmin } from '@/modules/panel/auth';
import { hashPassword } from '@/modules/core/auth/password';
import type { ActionResult } from '@/modules/panel/auth';

// ── Internal helpers (exported for testability) ──────────────────

export async function listUsersInternal(client: Client, tenantId: string): Promise<unknown[]> {
  const result = await client.execute({
    sql: `SELECT id, username, role, is_active, created_at, created_by
          FROM users WHERE tenant_id = ? ORDER BY username`,
    args: [tenantId],
  });
  return result.rows.map((r) => ({ ...r }));
}

export async function createUserInternal(
  client: Client,
  tenantId: string,
  username: string,
  role: string,
  password: string,
  createdBy: number,
): Promise<void> {
  // Check for duplicate
  const existing = await client.execute({
    sql: `SELECT id FROM users WHERE tenant_id = ? AND username = ?`,
    args: [tenantId, username],
  });
  if (existing.rows.length > 0) {
    throw new Error('Username already exists');
  }

  const hash = await hashPassword(password);
  await client.execute({
    sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_by, created_at)
          VALUES (?, ?, ?, ?, 1, ?, datetime('now'))`,
    args: [tenantId, username, role, hash, createdBy],
  });
}

export async function updateUserRoleInternal(
  client: Client,
  userId: number,
  role: string,
): Promise<void> {
  await client.execute({
    sql: `UPDATE users SET role = ? WHERE id = ?`,
    args: [role, userId],
  });
}

export async function toggleUserActiveInternal(
  client: Client,
  userId: number,
  tenantId: string,
): Promise<void> {
  const result = await client.execute({
    sql: `UPDATE users SET is_active = NOT is_active WHERE id = ? AND tenant_id = ?`,
    args: [userId, tenantId],
  });
  if (!result.rowsAffected) {
    throw new Error('User not found');
  }
}

export async function setUserProjectPermissionInternal(
  client: Client,
  tenantId: string,
  userId: number,
  project: string,
  permission: string,
  grantedBy: number,
): Promise<void> {
  if (permission === 'none') {
    await client.execute({
      sql: `DELETE FROM user_project_access WHERE tenant_id = ? AND user_id = ? AND project = ?`,
      args: [tenantId, userId, project],
    });
  } else {
    await client.execute({
      sql: `INSERT INTO user_project_access (tenant_id, user_id, project, permission, granted_by)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, user_id, project)
            DO UPDATE SET permission = excluded.permission, granted_by = excluded.granted_by`,
      args: [tenantId, userId, project, permission, grantedBy],
    });
  }
}

// ── Server Actions ───────────────────────────────────────────────

export async function listUsers(): Promise<ActionResult> {
  return withAdmin((client) => listUsersInternal(client, TENANT_ID()));
}

export async function createUser(
  username: string,
  role: string,
  password: string,
): Promise<ActionResult> {
  return withAdmin((client, userId) =>
    createUserInternal(client, TENANT_ID(), username, role, password, userId),
  );
}

export async function updateUserRole(userId: number, role: string): Promise<ActionResult> {
  return withAdmin((client) => updateUserRoleInternal(client, userId, role));
}

export async function toggleUserActive(userId: number): Promise<ActionResult> {
  return withAdmin((client) =>
    toggleUserActiveInternal(client, userId, TENANT_ID()),
  );
}

export async function setUserProjectPermission(
  userId: number,
  project: string,
  permission: string,
): Promise<ActionResult> {
  return withAdmin((client, adminId) =>
    setUserProjectPermissionInternal(client, TENANT_ID(), userId, project, permission, adminId),
  );
}
