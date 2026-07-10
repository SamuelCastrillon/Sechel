import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import type { Client } from '@libsql/client';

let client: Client;

beforeEach(async () => {
  const t = await createTestDb();
  client = t.client;
});

describe('migration — schema smoke', () => {
  it('creates all reconciled tables + FTS5 virtual tables', async () => {
    const res = await client.execute({
      sql: `SELECT name FROM sqlite_master
            WHERE type IN ('table','view')
              AND name IN ('sessions','observations','observations_fts','user_prompts',
                           'prompts_fts','memory_relations','users','projects',
                           'user_project_access','user_tokens','instance_settings','_migrations')`,
    });
    expect(res.rows.length).toBe(12);
  });

  it('creates the 3 FTS5 sync triggers', async () => {
    const res = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'obs_fts_%'`,
    });
    expect(res.rows.length).toBe(3);
  });

  it('tracks applied migrations in _migrations', async () => {
    const res = await client.execute({ sql: `SELECT version FROM _migrations` });
    expect(res.rows.map((r) => (r as unknown as { version: string }).version)).toContain('0001_init');
  });

  it('is idempotent: re-running migrations does not error or duplicate', async () => {
    const { runMigrations } = await import('@/modules/core/db/migrations');
    await runMigrations(client); // second pass
    const res = await client.execute({ sql: `SELECT version FROM _migrations` });
    // Expect 2 applied migrations (0001_init + 0002_auth)
    expect(res.rows.length).toBe(2);
  });

  it('seeds an admin account via idempotent bootstrap', async () => {
    const res = await client.execute({
      sql: `SELECT username, role FROM users WHERE role = 'admin'`,
    });
    expect(res.rows.length).toBe(1);
    expect((res.rows[0] as unknown as { username: string }).username).toBe('test-admin');
    expect((res.rows[0] as unknown as { role: string }).role).toBe('admin');
  });

  it('FTS5 trigger keeps observations_fts in sync on insert', async () => {
    await client.execute({
      sql: `INSERT INTO sessions (id, tenant_id, project, directory) VALUES ('s1','default','p','d')`,
    });
    await client.execute({
      sql: `INSERT INTO observations (tenant_id, session_id, type, title, content, project, scope)
            VALUES ('default','s1','manual','fts trigger test','fts trigger body','p','project')`,
    });
    const res = await client.execute({
      sql: `SELECT rowid FROM observations_fts WHERE observations_fts MATCH 'trigger'`,
    });
    expect(res.rows.length).toBe(1);
  });
});
