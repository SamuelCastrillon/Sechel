import { SignJWT, jwtVerify } from 'jose';
import { argon2id, argon2Verify } from 'hash-wasm';
import type { Context } from 'hono';

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
// Session-token helpers (jose-based, no Next.js / server-only)
// ---------------------------------------------------------------------------

const HEX_DIGITS = '0123456789abcdef';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += HEX_DIGITS[b >> 4] + HEX_DIGITS[b & 15];
  }
  return out;
}

/** SHA-256 hex digest (Web Crypto only, runs on Cloudflare Workers). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

/** Access JWT lifetime: 15 minutes (RT-1/NC-1). */
export const SESSION_COOKIE_MAX_AGE = 900;
/** Refresh cookie lifetime: 30 days (RT-2). */
export const REFRESH_COOKIE_MAX_AGE = 2592000;

function getSecret(secret?: string): Uint8Array {
  const raw = secret ?? process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(raw);
}

/**
 * Create a signed access JWT for the given user session.
 *
 * The `sid` claim binds the token to a specific auth_sessions row, which the
 * middleware re-validates against the DB on every request (SR-1). Tokens are
 * short-lived (15 min); sessions stay alive via /auth/refresh rotation.
 *
 * Accepts an optional `secret` parameter for testing / custom secrets.
 * Falls back to process.env.JWT_SECRET when omitted.
 */
export async function createSessionToken(
  payload: {
    userId: number;
    tenantId: string;
    role: string;
    sid: string;
  },
  secret?: string,
): Promise<string> {
  const key = getSecret(secret);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
}

/**
 * Verify and decode a signed JWT session token.
 *
 * Accepts an optional `secret` parameter for testing / custom secrets.
 * Falls back to process.env.JWT_SECRET when omitted.
 *
 * Returns the verified payload, or throws if the token is invalid / expired.
 */
export async function verifySessionToken(
  token: string,
  secret?: string,
): Promise<{ userId: number; tenantId: string; role: string; sid: string }> {
  const key = getSecret(secret);
  const { payload } = await jwtVerify(token, key);
  return payload as unknown as { userId: number; tenantId: string; role: string; sid: string };
}

/**
 * Generate a fresh opaque refresh token:
 * - `raw`: 80-char hex string (40 random bytes) — returned once to the client
 * - `hash`: SHA-256 hex of the raw token — the only thing stored in DB
 *
 * Same pattern as API tokens (tokens.ts). Uses Web Crypto only so it also
 * runs on Cloudflare Workers without the nodejs_compat compatibility flag.
 */
export async function generateRefreshToken(): Promise<{ raw: string; hash: string }> {
  const raw = toHex(crypto.getRandomValues(new Uint8Array(40)));
  return { raw, hash: await sha256Hex(raw) };
}

// ---------------------------------------------------------------------------
// Cookie builders
// ---------------------------------------------------------------------------

/**
 * Access-token cookie (15 min, RT-1/NC-1). `Secure` is applied on HTTPS
 * requests so production cookies are never sent over plain HTTP, while local
 * dev (plain http://localhost) keeps working. The cookie is same-site and
 * HttpOnly; the `__Host-` prefix is intentionally not used because the
 * cookie name is shared with the panel middleware which must keep
 * parseSessionCookie stable.
 */
export function sessionCookieString(token: string, secure: boolean): string {
  return `session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Refresh-token cookie (30 days, RT-2). Same Secure-aware behavior. */
export function refreshCookieString(token: string, secure: boolean): string {
  return `refresh=${token}; HttpOnly; Path=/; Max-Age=${REFRESH_COOKIE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearSessionCookieString(secure: boolean): string {
  return `session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearRefreshCookieString(secure: boolean): string {
  return `refresh=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function isSecureRequest(c: Context): boolean {
  const forwarded = c.req.header('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return new URL(c.req.url).protocol === 'https:';
}
