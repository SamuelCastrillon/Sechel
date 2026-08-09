import { jwtVerify } from 'jose';
import type { SessionPayload } from './types';

/**
 * Resolve the JWT secret through the same strategy the embedded server uses
 * (see apps/panel/src/server/index.ts resolveEmbeddedEnv):
 *
 * 1. `override` — Cloudflare runtime bindings arrive via locals.runtime.env,
 *    which the middleware passes through for every request.
 * 2. `import.meta.env` — Astro loads `.env` there (local dev, Vercel).
 * 3. `process.env` — built Node deployments (docker / node entry).
 *
 * Signer and verifier must agree on the secret, otherwise every valid token
 * is rejected and /admin/* redirects in a loop.
 */
export function resolveJwtSecret(override?: string): string | undefined {
  if (override) return override;
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env ?? {};
  const proc = typeof process !== 'undefined' ? process.env : undefined;
  return meta.JWT_SECRET ?? proc?.JWT_SECRET;
}

function getSecret(override?: string): Uint8Array {
  const raw = resolveJwtSecret(override);
  if (!raw) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(raw);
}

const COOKIE_NAME = 'session';

export async function verifySessionToken(
  token: string,
  secret?: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(secret), {
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

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : null;
}
