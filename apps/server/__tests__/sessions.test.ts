import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { jwtVerify } from 'jose';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@sechel-mcp/core';
import type { Env } from '../src/index.js';

// ---------------------------------------------------------------------------
// Setup: temp SQLite DB, seed admin, shared Kysely instance + app
// ---------------------------------------------------------------------------

const TEST_DB_PATH = join(tmpdir(), `sechel-test-sessions-${Date.now()}.db`);
const TEST_JWT_SECRET = 'sessions-test-secret-32-chars-min!!';
const TENANT = 'sess-test';
const ADMIN_USERNAME = 'sess-admin';
const ADMIN_PASSWORD = 'sess-password';

let db: Kysely<CortexDB>;
let app: Hono<{ Bindings: Env }>;
let testEnv: Env;

type TokenPayload = {
  userId: number;
  tenantId: string;
  role: string;
  sid: string;
  exp: number;
  iat: number;
};

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: `file:${TEST_DB_PATH}` });
  const { runMigrations } = await import('@sechel-mcp/core');
  await runMigrations(client);
  const { seedAdmin } = await import('../src/admin/seed.js');
  await seedAdmin(client, TENANT, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  client.close();

  const { createDb } = await import('@sechel-mcp/core');
  db = await createDb({ url: `file:${TEST_DB_PATH}` });

  testEnv = { DATABASE_URL: `file:${TEST_DB_PATH}`, TENANT_ID: TENANT };

  const mod = await import('../src/index.js');
  app = mod.createApp({ db, jwtSecret: TEST_JWT_SECRET });
});

afterAll(() => {
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSetCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cookie of res.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function decodeToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  return payload as unknown as TokenPayload;
}

async function login(): Promise<{ cookies: Record<string, string>; body: Record<string, unknown> }> {
  const res = await app.request('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  }, testEnv);
  expect(res.status).toBe(200);
  return { cookies: parseSetCookies(res), body: await res.json() as Record<string, unknown> };
}

function refreshCookieString(cookies: Record<string, string>): string {
  const parts: string[] = [];
  if (cookies.session) parts.push(`session=${cookies.session}`);
  if (cookies.refresh) parts.push(`refresh=${cookies.refresh}`);
  return parts.join('; ');
}

function postRefresh(cookies?: Record<string, string>, bodyToken?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookies) headers.Cookie = refreshCookieString(cookies);
  if (bodyToken) headers['Content-Type'] = 'application/json';
  return app.request('/admin/auth/refresh', {
    method: 'POST',
    headers,
    body: bodyToken ? JSON.stringify({ refresh_token: bodyToken }) : undefined,
  }, testEnv);
}

type SessionRow = {
  id: string;
  tenant_id: string;
  user_id: number;
  refresh_hash: string | null;
  prev_hash: string | null;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  lineage_id: string;
};

async function sessionRowByHash(hash: string): Promise<SessionRow | undefined> {
  const rows = await sql<SessionRow>`
    SELECT id, tenant_id, user_id, refresh_hash, prev_hash, last_used_at, expires_at, revoked_at, lineage_id
    FROM auth_sessions
    WHERE refresh_hash = ${hash} OR prev_hash = ${hash}
    LIMIT 1
  `.execute(db);
  return rows.rows[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /admin/auth/refresh — happy rotation (RT-1/RT-2)', () => {
  it('rotates the refresh token: 200, new access JWT, rotated cookie, prev_hash + last_used_at updated', async () => {
    const { cookies, body } = await login();
    expect(cookies.refresh).toBeTruthy();
    expect(typeof body.refresh_token).toBe('string');

    const oldHash = await sha256Hex(cookies.refresh);
    const rowBefore = await sessionRowByHash(oldHash);
    expect(rowBefore).toBeTruthy();

    const res = await postRefresh(cookies);
    expect(res.status).toBe(200);

    // Body carries the new access token (NC-1 shape: body.token).
    const resBody = await res.json() as Record<string, unknown>;
    expect(typeof resBody.token).toBe('string');

    // Two cookies are returned: refreshed session + rotated refresh.
    const resCookies = parseSetCookies(res);
    expect(resCookies.session).toBeTruthy();
    expect(resCookies.refresh).toBeTruthy();
    expect(resCookies.refresh).not.toBe(cookies.refresh);

    // The new access JWT is bound to the same session row (sid claim).
    const sessionPayload = await decodeToken(resCookies.session);
    expect(sessionPayload.sid).toBe(rowBefore!.id);

    // DB: old hash moved to prev_hash, new hash stored, last_used_at bumped.
    const rowAfter = await sessionRowByHash(oldHash);
    expect(rowAfter).toBeTruthy();
    expect(rowAfter!.prev_hash).toBe(oldHash);
    expect(rowAfter!.refresh_hash).not.toBe(oldHash);
    expect(rowAfter!.refresh_hash).toBe(await sha256Hex(resCookies.refresh));
    expect(rowAfter!.last_used_at >= rowBefore!.last_used_at).toBe(true);
    expect(rowAfter!.revoked_at).toBeNull();
  });

  it('issues a 15-minute access JWT carrying the sid claim', async () => {
    const { cookies } = await login();
    const oldHash = await sha256Hex(cookies.refresh);
    const row = await sessionRowByHash(oldHash);
    expect(row).toBeTruthy();

    const res = await postRefresh(cookies);
    expect(res.status).toBe(200);
    const resBody = await res.json() as Record<string, unknown>;

    const payload = await decodeToken(resBody.token as string);
    expect(payload.sid).toBe(row!.id);
    expect(payload.tenantId).toBe(TENANT);
    expect(payload.role).toBe('admin');
    // exp - iat ≈ 15 minutes (900 s)
    expect(Math.abs((payload.exp - payload.iat) - 900)).toBeLessThanOrEqual(1);
  });

  it('works from JSON body refresh_token (cookie-less clients)', async () => {
    const { cookies, body } = await login();
    const res = await postRefresh(undefined, body.refresh_token as string);
    expect(res.status).toBe(200);
    const resBody = await res.json() as Record<string, unknown>;
    expect(typeof resBody.token).toBe('string');
    // The raw cookie from login is now consumed (one-time use).
    const replay = await postRefresh(cookies);
    expect(replay.status).toBe(401);
  });

  it('rejects foreign-Origin cookie refresh (CSRF) but allows foreign-Origin body refresh', async () => {
    const { cookies, body } = await login();

    // Cookie transport = ambient credential → same-origin required.
    const foreign = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: `refresh=${cookies.refresh}`,
        Origin: 'https://evil.example.com',
      },
    }, testEnv);
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('Set-Cookie')).toBeNull();

    // Body transport carries no ambient credentials → not CSRF-able.
    const bodyRes = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example.com',
      },
      body: JSON.stringify({ refresh_token: body.refresh_token }),
    }, testEnv);
    expect(bodyRes.status).toBe(200);
  });

  it('works when the access JWT is expired or absent (exempt path)', async () => {
    const { cookies } = await login();
    // No session cookie at all — only the refresh cookie.
    const res = await app.request('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `refresh=${cookies.refresh}` },
    }, testEnv);
    expect(res.status).toBe(200);
  });
});

describe('POST /admin/auth/refresh — reuse detection (RT-3)', () => {
  it('two-tab race: loser 401 within grace, retries with winner cookie → 200, lineage intact', async () => {
    const { cookies } = await login();
    const oldHash = await sha256Hex(cookies.refresh);

    // Tab A wins the rotation.
    const winner = await postRefresh(cookies);
    expect(winner.status).toBe(200);
    const winnerCookies = parseSetCookies(winner);

    // Tab B replays the stale cookie → 401 within grace, NO lineage revoke.
    const loser = await postRefresh(cookies);
    expect(loser.status).toBe(401);
    expect(loser.headers.get('Set-Cookie')).toBeNull();

    const rowAfterLoss = await sessionRowByHash(oldHash);
    expect(rowAfterLoss!.revoked_at).toBeNull();
    expect(rowAfterLoss!.lineage_id).toBeTruthy();

    // Tab B retries with the winner's rotated cookie → 200.
    const retry = await postRefresh(winnerCookies);
    expect(retry.status).toBe(200);

    // Lineage intact: same row, same lineage, no revoke.
    const finalRow = await sessionRowByHash(await sha256Hex(winnerCookies.refresh));
    expect(finalRow!.id).toBe(rowAfterLoss!.id);
    expect(finalRow!.lineage_id).toBe(rowAfterLoss!.lineage_id);
    expect(finalRow!.revoked_at).toBeNull();
  });

  it('grace boundary 59s: replay → 401 without revoke', async () => {
    const { cookies } = await login();
    const oldHash = await sha256Hex(cookies.refresh);

    const first = await postRefresh(cookies);
    expect(first.status).toBe(200);

    // Replay the consumed hash 58 s after its rotation (the old hash now
    // lives in prev_hash). -58s keeps the replay age <= 59 s even if the
    // request lands on the next wall-clock second (SQLite 1s resolution):
    // -59s could tick over to 60s on a loaded CI and flip the boundary.
    await sql`
      UPDATE auth_sessions SET last_used_at = datetime('now', '-58 seconds')
      WHERE prev_hash = ${oldHash}
    `.execute(db);

    const replay = await postRefresh(cookies);
    expect(replay.status).toBe(401);
    // No rotated cookie must ever be issued on a rejected path (gate W3:
    // a cookie here would escalate a stolen-hash replay).
    expect(replay.headers.get('Set-Cookie')).toBeNull();

    const row = await sessionRowByHash(oldHash);
    expect(row!.revoked_at).toBeNull();
  });

  it('grace boundary 60s: replay → lineage revoked', async () => {
    const { cookies } = await login();
    const oldHash = await sha256Hex(cookies.refresh);

    const first = await postRefresh(cookies);
    expect(first.status).toBe(200);

    await sql`
      UPDATE auth_sessions SET last_used_at = datetime('now', '-60 seconds')
      WHERE prev_hash = ${oldHash}
    `.execute(db);

    const replay = await postRefresh(cookies);
    expect(replay.status).toBe(401);

    const row = await sessionRowByHash(oldHash);
    expect(row!.revoked_at).not.toBeNull();
  });

  it('replay after grace revokes the whole lineage (all rows sharing lineage_id)', async () => {
    const { cookies } = await login();
    const oldHash = await sha256Hex(cookies.refresh);
    const row = await sessionRowByHash(oldHash);
    expect(row).toBeTruthy();

    // Second device on the same lineage.
    await sql`
      INSERT INTO auth_sessions (id, tenant_id, user_id, device_name, expires_at, refresh_hash, lineage_id)
      VALUES ('sess-lineage-b', ${TENANT}, ${row!.user_id}, 'phone',
              datetime('now', '+30 days'), ${'deadbeef-lineage-b'}, ${row!.lineage_id})
    `.execute(db);

    const first = await postRefresh(cookies);
    expect(first.status).toBe(200);

    // Replay after the 60 s grace window (old hash now lives in prev_hash).
    await sql`
      UPDATE auth_sessions SET last_used_at = datetime('now', '-61 seconds')
      WHERE prev_hash = ${oldHash}
    `.execute(db);

    const replay = await postRefresh(cookies);
    expect(replay.status).toBe(401);

    const lineageRows = await sql<{ id: string; revoked_at: string | null }>`
      SELECT id, revoked_at FROM auth_sessions WHERE lineage_id = ${row!.lineage_id}
    `.execute(db);
    expect(lineageRows.rows.length).toBe(2);
    for (const r of lineageRows.rows) {
      expect(r.revoked_at).not.toBeNull();
    }
  });

  it('unknown hash → plain 401, nothing revoked', async () => {
    const revokedBefore = await sql<{ count: number }>`
      SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NOT NULL
    `.execute(db);

    const res = await postRefresh(undefined, 'a'.repeat(80));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });

    // The request must not revoke anything (gate W3: no lineage action for
    // hashes that were never issued).
    const revokedAfter = await sql<{ count: number }>`
      SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NOT NULL
    `.execute(db);
    expect(Number(revokedAfter.rows[0].count)).toBe(Number(revokedBefore.rows[0].count));
  });
});

describe('POST /admin/auth/refresh — expiry and failure modes (RT-4, RT-2)', () => {
  it('expired refresh → 401, row not revived', async () => {
    const { cookies } = await login();
    const oldHash = await sha256Hex(cookies.refresh);
    const row = await sessionRowByHash(oldHash);
    expect(row).toBeTruthy();

    await sql`
      UPDATE auth_sessions SET expires_at = datetime('now', '-1 day')
      WHERE refresh_hash = ${oldHash}
    `.execute(db);

    const res = await postRefresh(cookies);
    expect(res.status).toBe(401);

    const after = await sessionRowByHash(oldHash);
    expect(after!.revoked_at).toBeNull(); // not revoked, just dead
    expect(after!.refresh_hash).toBe(oldHash); // never rotated
  });

  it('rate limited: 429 after 10 attempts per window (same token)', async () => {
    const { cookies } = await login();

    let statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await postRefresh(cookies);
      statuses.push(res.status);
    }
    // First call consumed the token (200); the next 9 are grace 401s.
    expect(statuses[0]).toBe(200);
    for (let i = 1; i < 10; i++) {
      expect(statuses[i]).toBe(401);
    }

    const blocked = await postRefresh(cookies);
    expect(blocked.status).toBe(429);
  });
});

describe('POST /admin/auth/refresh — fail-closed on DB write error (RT-4)', () => {
  const TEST_DB_PATH2 = join(tmpdir(), `sechel-test-sessions-failclosed-${Date.now()}.db`);
  let db2: Kysely<CortexDB>;
  let app2: Hono<{ Bindings: Env }>;
  let refreshToken: string;

  beforeAll(async () => {
    const { createClient } = await import('@libsql/client');
    const client = createClient({ url: `file:${TEST_DB_PATH2}` });
    const { runMigrations } = await import('@sechel-mcp/core');
    await runMigrations(client);
    const { seedAdmin } = await import('../src/admin/seed.js');
    await seedAdmin(client, TENANT, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    client.close();

    const { createDb } = await import('@sechel-mcp/core');
    db2 = await createDb({ url: `file:${TEST_DB_PATH2}` });

    const mod = await import('../src/index.js');
    app2 = mod.createApp({ db: db2, jwtSecret: TEST_JWT_SECRET });

    const loginRes = await app2.request('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    }, { DATABASE_URL: `file:${TEST_DB_PATH2}`, TENANT_ID: TENANT });
    expect(loginRes.status).toBe(200);
    refreshToken = parseSetCookies(loginRes).refresh;
  });

  afterAll(() => {
    try { unlinkSync(TEST_DB_PATH2); } catch { /* ignore */ }
  });

  it('write failure → 500, no tokens issued, row untouched', async () => {
    // Kill the DB connection: every subsequent query throws.
    await db2.destroy();

    const res = await app2.request('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `refresh=${refreshToken}` },
    }, { DATABASE_URL: `file:${TEST_DB_PATH2}`, TENANT_ID: TENANT });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(res.headers.get('Set-Cookie')).toBeNull();

    // Re-open the same file: the row must be untouched (old hash, not revoked).
    const { createDb } = await import('@sechel-mcp/core');
    const db3 = await createDb({ url: `file:${TEST_DB_PATH2}` });
    const rows = await sql<{ refresh_hash: string; prev_hash: string | null; revoked_at: string | null }>`
      SELECT refresh_hash, prev_hash, revoked_at FROM auth_sessions
    `.execute(db3);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].refresh_hash).toBe(await sha256Hex(refreshToken));
    expect(rows.rows[0].prev_hash).toBeNull();
    expect(rows.rows[0].revoked_at).toBeNull();
    await db3.destroy();
  });
});
