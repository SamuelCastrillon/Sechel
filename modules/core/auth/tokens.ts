import 'server-only';
import { randomBytes, createHash } from 'node:crypto';

/**
 * Generate a new API token with:
 * - `raw`: 80-char hex string (40 random bytes)
 * - `hash`: SHA-256 hex of the raw token (for storage/lookup)
 * - `prefix`: "sk_" + first 7 chars (for UI display)
 */
export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = randomBytes(40).toString('hex');
  const hash = createHash('sha256').update(raw, 'utf-8').digest('hex');
  const prefix = 'sk_' + raw.slice(0, 7);
  return { raw, hash, prefix };
}

/**
 * Compute the SHA-256 hex hash of a raw token string.
 * Used to look up tokens stored via `generateApiToken().hash`.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf-8').digest('hex');
}
