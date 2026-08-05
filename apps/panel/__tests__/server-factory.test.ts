import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmbeddedApp,
  resolveEmbeddedEnv,
  embeddedEnvFromLocals,
  getEmbeddedApp,
  handleApiRequest,
  type EmbeddedAppEnv,
} from '../src/server/index';

// Deterministic argon2id hash for password 'admin123' (fixed zero salt).
const ADMIN_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$VpoaBhJVfGlo4F9ZQ0Kel4G/z5CzG+UCOyWCLWr5dgY';
const TEST_JWT_SECRET = 'test-secret-key-for-panel-tests-32chars!';
const TEST_ENV: EmbeddedAppEnv = {
  DATABASE_URL: ':memory:',
  JWT_SECRET: TEST_JWT_SECRET,
  TENANT_ID: 'default',
};

// ---------------------------------------------------------------------------
// Env resolution
// ---------------------------------------------------------------------------

describe('resolveEmbeddedEnv', () => {
  it('returns the override as-is when provided (Cloudflare locals)', () => {
    const override: EmbeddedAppEnv = { DATABASE_URL: 'libsql://db.turso.io', TENANT_ID: 'acme' };
    expect(resolveEmbeddedEnv(override)).toBe(override);
  });

  it('falls back to process.env when no override (built node deploy)', () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file:/tmp/embedded-test.db';
    try {
      expect(resolveEmbeddedEnv().DATABASE_URL).toBe('file:/tmp/embedded-test.db');
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });
});

describe('embeddedEnvFromLocals', () => {
  it('extracts bindings from Cloudflare-style locals', () => {
    const env = embeddedEnvFromLocals({
      runtime: {
        env: {
          DATABASE_URL: 'libsql://db.turso.io',
          DATABASE_AUTH_TOKEN: 'tok',
          JWT_SECRET: 'secret',
          TENANT_ID: 't1',
          ASSETS: { fetch: () => Promise.resolve(new Response()) },
        },
      },
    });
    expect(env?.DATABASE_URL).toBe('libsql://db.turso.io');
    expect(env?.DATABASE_AUTH_TOKEN).toBe('tok');
    expect(env?.JWT_SECRET).toBe('secret');
    expect(env?.TENANT_ID).toBe('t1');
  });

  it('returns undefined when locals has no runtime (node/vercel)', () => {
    expect(embeddedEnvFromLocals({})).toBeUndefined();
    expect(embeddedEnvFromLocals({ runtime: undefined })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createEmbeddedApp', () => {
  it('throws when DATABASE_URL is missing', async () => {
    await expect(createEmbeddedApp({})).rejects.toThrow(
      'DATABASE_URL is required for the embedded server',
    );
  });

  it('creates app + db from an explicit env and serves /api/admin/health', async () => {
    const { app } = await createEmbeddedApp(TEST_ENV);
    const res = await app.fetch(
      new Request('http://localhost:3000/api/admin/health'),
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('mounts admin routes under /api/admin prefix', async () => {
    const { app } = await createEmbeddedApp(TEST_ENV);
    // Unprotected route reachable at the prefixed path
    const res = await app.fetch(
      new Request('http://localhost:3000/api/admin/public/registration-enabled'),
      TEST_ENV,
    );
    expect(res.status).toBe(200);
  });

  it('login returns 200 + token for a seeded admin', async () => {
    const { app, db } = await createEmbeddedApp(TEST_ENV);
    await db
      .insertInto('users')
      .values({
        tenant_id: 'default',
        username: 'admin',
        role: 'admin',
        credential_hash: ADMIN_HASH,
      })
      .execute();

    const res = await app.fetch(
      new Request('http://localhost:3000/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.token).toBe('string');
    expect(res.headers.get('Set-Cookie')).toContain('session=');
  });

  it('login returns 401 for wrong credentials', async () => {
    const { app, db } = await createEmbeddedApp(TEST_ENV);
    await db
      .insertInto('users')
      .values({
        tenant_id: 'default',
        username: 'admin',
        role: 'admin',
        credential_hash: ADMIN_HASH,
      })
      .execute();

    const res = await app.fetch(
      new Request('http://localhost:3000/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      }),
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Cached accessor + request handler (temp file DB, mirrors local dev)
// ---------------------------------------------------------------------------

const FILE_DB_PATH = join(tmpdir(), `sechel-panel-test-${Date.now()}.db`);
const FILE_ENV: EmbeddedAppEnv = {
  DATABASE_URL: `file:${FILE_DB_PATH}`,
  JWT_SECRET: TEST_JWT_SECRET,
  TENANT_ID: 'default',
};

describe('getEmbeddedApp + handleApiRequest', () => {
  beforeAll(async () => {
    const { db } = await getEmbeddedApp(FILE_ENV);
    await db
      .insertInto('users')
      .values({
        tenant_id: 'default',
        username: 'admin',
        role: 'admin',
        credential_hash: ADMIN_HASH,
      })
      .execute();
  });

  afterAll(() => {
    try { unlinkSync(FILE_DB_PATH); } catch { /* ignore */ }
  });

  it('caches a single app instance per runtime', async () => {
    const first = await getEmbeddedApp(FILE_ENV);
    const second = await getEmbeddedApp(FILE_ENV);
    expect(second).toBe(first);
  });

  it('delegates login through handleApiRequest (200 + token)', async () => {
    const res = await handleApiRequest(
      new Request('http://localhost:3000/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      }),
      FILE_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.token).toBe('string');
    expect(body.user).toEqual({ id: 1, username: 'admin', role: 'admin' });
  });

  it('delegates health through handleApiRequest (200)', async () => {
    const res = await handleApiRequest(
      new Request('http://localhost:3000/api/admin/health'),
      FILE_ENV,
    );
    expect(res.status).toBe(200);
  });

  it('falls through to 404 for unknown /api paths', async () => {
    const res = await handleApiRequest(
      new Request('http://localhost:3000/api/unknown/path'),
      FILE_ENV,
    );
    expect(res.status).toBe(404);
  });
});
