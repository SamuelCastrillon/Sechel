import { createHash } from 'node:crypto';

/**
 * Compute the SHA-256 hex hash of a raw token string.
 * Used to look up tokens stored via `generateApiToken().hash`.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf-8').digest('hex');
}
