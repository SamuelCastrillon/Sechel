import { SignJWT, jwtVerify } from 'jose';
import { argon2id, argon2Verify } from 'hash-wasm';

// ---------------------------------------------------------------------------
// Password hashing (moved from packages/core/src/password.ts)
// ---------------------------------------------------------------------------

/**
 * Hash a password using argon2id (OWASP-recommended, ASIC-resistant).
 * Returns an encoded string containing algorithm, version, parameters, salt, and hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MB
    hashLength: 32,
    outputType: 'encoded',
  });
}

/**
 * Verify a password against an argon2id-encoded hash.
 * Returns true if the password matches, false otherwise.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2Verify({
    password,
    hash,
  });
}

// ---------------------------------------------------------------------------
// Draft session-token helpers (jose-based, no Next.js / server-only)
// ---------------------------------------------------------------------------

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw) throw new Error('SESSION_SECRET environment variable is required');
  return new TextEncoder().encode(raw);
}

/**
 * Create a signed JWT session token for the given user.
 *
 * Draft — the exact payload shape and expiry are TBD.
 */
export async function createSessionToken(payload: {
  userId: number;
  tenantId: string;
  role: string;
}): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

/**
 * Verify and decode a signed JWT session token.
 *
 * Returns the verified payload, or throws if the token is invalid / expired.
 */
export async function verifySessionToken(
  token: string,
): Promise<{ userId: number; tenantId: string; role: string }> {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as { userId: number; tenantId: string; role: string };
}
