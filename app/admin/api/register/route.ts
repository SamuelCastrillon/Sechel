import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /admin/api/register
 *
 * Accepts JSON body: { username, password }
 * On success: returns 201 with user ID
 * On failure: returns 403 (disabled) or 400 (validation) or 409 (exists)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 },
      );
    }

    const { createClient } = await import('@libsql/client');
    const { resolveUrl, TENANT_ID } = await import('@/modules/core/db');
    const { hashPassword } = await import('@/modules/core/auth/password');

    const client = createClient(resolveUrl());

    try {
      // Check registration gating
      const settings = await client.execute({
        sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
      });
      const enabled = settings.rows.length > 0
        ? (settings.rows[0] as Record<string, unknown>).value === '1'
        : false;

      if (!enabled) {
        return NextResponse.json({ error: 'Registration is disabled' }, { status: 403 });
      }

      // Check if username already exists
      const existing = await client.execute({
        sql: `SELECT id FROM users WHERE tenant_id = ? AND username = ?`,
        args: [TENANT_ID(), username],
      });
      if (existing.rows.length > 0) {
        return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
      }

      const hash = await hashPassword(password);
      await client.execute({
        sql: `INSERT INTO users (tenant_id, username, role, credential_hash, is_active, created_at)
              VALUES (?, ?, 'member', ?, 0, datetime('now'))`,
        args: [TENANT_ID(), username, hash],
      });

      return NextResponse.json({ success: true }, { status: 201 });
    } finally {
      client.close();
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Registration failed' },
      { status: 500 },
    );
  }
}
