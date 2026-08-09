import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';

const TEST_SECRET = 'test-jwt-secret-for-unit-tests-only-min-32-chars!!';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

describe('session — JWT verify', () => {
  async function signToken(payload: Record<string, unknown>, secret: string, exp?: string) {
    const key = new TextEncoder().encode(secret);
    const jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
    if (exp) jwt.setExpirationTime(exp);
    return jwt.sign(key);
  }

  it('verifySessionToken returns payload for a token signed with the env secret', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const token = await signToken({ userId: 42, role: 'member' }, TEST_SECRET);
    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(42);
    expect(payload!.role).toBe('member');
  });

  it('verifySessionToken accepts an explicit secret (Cloudflare locals override)', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const explicit = 'explicit-secret-for-cf-locals-override-32chars!!';
    const token = await signToken({ userId: 7, role: 'admin' }, explicit);
    const payload = await verifySessionToken(token, explicit);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(7);
  });

  it('verifySessionToken returns null when the explicit secret differs from the signer', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const token = await signToken({ userId: 7, role: 'admin' }, TEST_SECRET);
    const payload = await verifySessionToken(token, 'a-different-secret-for-the-verifier!!');
    expect(payload).toBeNull();
  });

  it('verifySessionToken returns null for expired token', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const expired = await signToken(
      { userId: 1, role: 'admin' },
      TEST_SECRET,
      '-1m',
    );
    const payload = await verifySessionToken(expired);
    expect(payload).toBeNull();
  });

  it('verifySessionToken returns null for malformed token', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const payload = await verifySessionToken('not-a-valid-jwt');
    expect(payload).toBeNull();
  });

  it('verifySessionToken returns null when payload is missing role', async () => {
    const { verifySessionToken } = await import('@/lib/session');
    const token = await signToken({ userId: 1 }, TEST_SECRET);
    const payload = await verifySessionToken(token);
    expect(payload).toBeNull();
  });
});

describe('session — secret resolution (matches embedded resolveEmbeddedEnv)', () => {
  it('resolveJwtSecret prefers the explicit override', async () => {
    const { resolveJwtSecret } = await import('@/lib/session');
    expect(resolveJwtSecret('override')).toBe('override');
  });

  it('resolveJwtSecret falls back to process.env.JWT_SECRET (node)', async () => {
    const { resolveJwtSecret } = await import('@/lib/session');
    expect(resolveJwtSecret()).toBe(TEST_SECRET);
  });

  it('resolveJwtSecret returns undefined when nothing is configured', async () => {
    const { resolveJwtSecret } = await import('@/lib/session');
    const prev = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(resolveJwtSecret()).toBeUndefined();
    } finally {
      process.env.JWT_SECRET = prev;
    }
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
});
