import type { Context } from 'hono';

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Per-process only: sufficient as defense-in-depth against brute force and
 * argon2 memory-exhaustion DoS on the public login/register endpoints. It is
 * NOT a distributed limiter — deployments behind multiple workers should add
 * an edge-level limit (e.g. Cloudflare rate limiting).
 */
export interface RateLimitOptions {
  /** Window length in milliseconds. Default: 60_000 (1 minute). */
  windowMs?: number;
  /** Maximum allowed hits per window per key. Default: 10. */
  max?: number;
}

export function createRateLimiter(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 10;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /**
     * Increment the counter for the given key and return true when the
     * request is allowed. Expired entries are cleaned lazily on access.
     */
    allow(key: string): boolean {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    /** Drop the counter for a key (e.g. after a successful login). */
    reset(key: string): void {
      hits.delete(key);
    },
  };
}

/**
 * Best-effort client IP for rate limiting. Honours X-Forwarded-For (first
 * entry, set by trusted proxies) and Cloudflare's CF-Connecting-IP.
 */
export function clientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('cf-connecting-ip') ??
    'unknown'
  );
}
