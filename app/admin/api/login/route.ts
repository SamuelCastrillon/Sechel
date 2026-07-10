import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /admin/api/login
 *
 * Accepts JSON body: { username, password }
 * On success: sets HttpOnly session cookie and returns 200
 * On failure: returns 401 with error message
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

    let errorResponse: string | null = null;
    let tokenValue: string | null = null;

    // We need to re-implement the core login logic here since the server action
    // handles cookies differently (via Next.js server action API).
    const { getDb } = await import('@/modules/core/db');
    const { TENANT_ID } = await import('@/modules/core/db');
    const { verifyPassword } = await import('@/modules/core/auth/password');
    const { createSessionToken } = await import('@/modules/panel/auth');
    const { sql } = await import('kysely');

    const db = await getDb();

    const users = await db
      .selectFrom('users')
      .select(['id', 'credential_hash', 'role', 'is_active'])
      .where('tenant_id', '=', TENANT_ID())
      .where('username', '=', username)
      .execute();

    if (users.length === 0) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const user = users[0];

    if (!user.is_active) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.credential_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const token = await createSessionToken({ userId: Number(user.id), role: user.role });

    const response = NextResponse.json({ success: true }, { status: 200 });
    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
    });

    return response;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Login failed' },
      { status: 500 },
    );
  }
}
