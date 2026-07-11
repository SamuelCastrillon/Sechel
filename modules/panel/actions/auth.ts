'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Client } from '@libsql/client';
import { getDb, TENANT_ID, resolveUrl } from '@/modules/core/db';
import { verifyPassword, hashPassword } from '@/modules/core/auth/password';
import { createSessionToken, withAdmin } from '@/modules/panel/auth';
import type { ActionResult } from '@/modules/panel/auth';
import { createClient } from '@libsql/client';

// ── Password Management ───────────────────────────────────────────

/**
 * Change the current admin's password.
 * Verifies current password before updating.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult> {
  if (!currentPassword || !newPassword) {
    return { success: false, error: 'Current password and new password are required' };
  }

  if (newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters' };
  }

  return withAdmin(async (client, userId) => {
    // Verify current password
    const user = await client.execute({
      sql: `SELECT credential_hash FROM users WHERE id = ?`,
      args: [userId],
    });

    if (user.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentHash = (user.rows[0] as Record<string, unknown>).credential_hash as string;
    const valid = await verifyPassword(currentPassword, currentHash);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }

    // Update to new password
    const newHash = await hashPassword(newPassword);
    await client.execute({
      sql: `UPDATE users SET credential_hash = ? WHERE id = ?`,
      args: [newHash, userId],
    });

    return { message: 'Password changed successfully' };
  });
}

/**
 * Shared login logic used by both the server action and API routes.
 * Returns null on success (handles cookie + redirect internally),
 * or an error message string on failure.
 */
async function performLogin(
  username: string,
  password: string,
  setCookie: (name: string, value: string, attrs: Record<string, string | number | boolean>) => void,
): Promise<string | null> {
  const db = await getDb();

  const users = await db
    .selectFrom('users')
    .select(['id', 'credential_hash', 'role', 'is_active'])
    .where('tenant_id', '=', TENANT_ID())
    .where('username', '=', username)
    .execute();

  if (users.length === 0) return 'Invalid username or password';

  const user = users[0];

  if (!user.is_active) return 'Account is inactive';

  const valid = await verifyPassword(password, user.credential_hash);
  if (!valid) return 'Invalid username or password';

  const token = await createSessionToken({ userId: Number(user.id), role: user.role });
  setCookie('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 900, // 15 minutes in seconds
  });

  return null;
}

/**
 * Server Action: Login with username + password.
 * On success, sets HttpOnly session cookie and redirects to /admin.
 */
export async function loginAction(formData: FormData): Promise<void> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  const cookieStore = await cookies();

  const error = await performLogin(username, password, (name, value, attrs) => {
    cookieStore.set(name, value, attrs);
  });

  if (error) {
    throw new Error(error);
  }

  redirect('/admin');
}

/**
 * Server Action: Register a new user (inactive by default).
 * Gated by `registration_enabled` in instance_settings.
 * Returns { success: true } or throws an error.
 */
export async function registerAction(formData: FormData): Promise<{ success: boolean }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  const db = await getDb();
  const client: Client = createClient(resolveUrl());

  try {
    // Check registration gating
    const settings = await client.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
    });
    const enabled = settings.rows.length > 0
      ? (settings.rows[0] as Record<string, unknown>).value === '1'
      : false;

    if (!enabled) {
      throw new Error('Registration is disabled');
    }

    // Check if username already exists
    const existing = await client.execute({
      sql: `SELECT id FROM users WHERE tenant_id = ? AND username = ?`,
      args: [TENANT_ID(), username],
    });
    if (existing.rows.length > 0) {
      throw new Error('Username already exists');
    }

    const hash = await hashPassword(password);
    await client.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
            VALUES (?, ?, 'member', ?, 0, datetime('now'))`,
      args: [TENANT_ID(), username, hash],
    });

    return { success: true };
  } finally {
    client.close();
  }
}
