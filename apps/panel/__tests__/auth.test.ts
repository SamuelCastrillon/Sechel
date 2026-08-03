import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only-min-32-chars!!';
});

describe('session — JWT create and verify', () => {
  it('createSessionToken produces a signed JWT with 3 parts', async () => {
    const { createSessionToken } = await import('@/lib/session');
    const token = await createSessionToken({ userId: 1, role: 'admin' });
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifySessionToken returns payload for valid token', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/session');
    const token = await createSessionToken({ userId: 42, role: 'member' });
    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(42);
    expect(payload!.role).toBe('member');
  });

  it('verifySessionToken returns null for expired token', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const expired = await new SignJWT({ userId: 1, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime('-1m')
      .sign(secret);
    const payload = await verifySessionToken(expired);
    expect(payload).toBeNull();
  });

  it('verifySessionToken returns null for malformed token', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const payload = await verifySessionToken('not-a-valid-jwt');
    expect(payload).toBeNull();
  });

  it('different payloads produce different tokens', async () => {
    const { createSessionToken } = await import('@/lib/session');
    const t1 = await createSessionToken({ userId: 1, role: 'admin' });
    const t2 = await createSessionToken({ userId: 2, role: 'member' });
    expect(t1).not.toBe(t2);
  });
});

describe('session — cookie helpers', () => {
  it('parseSessionCookie extracts value from header', async () => {
    const { parseSessionCookie } = await import('@/lib/session');
    const val = parseSessionCookie('session=abc123; other=def');
    expect(val).toBe('abc123');
  });

  it('parseSessionCookie returns null for missing cookie', async () => {
    const { parseSessionCookie } = await import('@/lib/session');
    const val = parseSessionCookie('other=def');
    expect(val).toBeNull();
  });

  it('parseSessionCookie returns null for empty header', async () => {
    const { parseSessionCookie } = await import('@/lib/session');
    const val = parseSessionCookie(null);
    expect(val).toBeNull();
  });

  it('getSessionCookieString produces valid cookie', async () => {
    const { getSessionCookieString } = await import('@/lib/session');
    const cookie = getSessionCookieString('test-token');
    expect(cookie).toContain('session=test-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=900');
  });

  it('clearSessionCookieString produces expiry cookie', async () => {
    const { clearSessionCookieString } = await import('@/lib/session');
    const cookie = clearSessionCookieString();
    expect(cookie).toContain('session=');
    expect(cookie).toContain('Max-Age=0');
  });
});
