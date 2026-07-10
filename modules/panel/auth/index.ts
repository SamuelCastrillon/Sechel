import 'server-only';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Derive the JWT secret from an env var or a default (dev-only).
 * In production, set JWT_SECRET to a strong random string (min 32 chars).
 */
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? 'sechel-dev-jwt-secret-change-in-production-32chr';
  return new TextEncoder().encode(secret);
}

/**
 * Create a JWT session token with 15-minute expiry.
 * Used for admin panel authentication.
 */
export async function createSessionToken(payload: {
  userId: number;
  role: string;
}): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());
}

/**
 * Verify and decode a JWT session token.
 * Returns null if the token is invalid, expired, or malformed.
 */
export async function verifySessionToken(
  token: string,
): Promise<{ userId: number; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    const userId = payload.userId as number | undefined;
    const role = payload.role as string | undefined;
    if (typeof userId !== 'number' || typeof role !== 'string') return null;
    return { userId, role };
  } catch {
    return null;
  }
}
