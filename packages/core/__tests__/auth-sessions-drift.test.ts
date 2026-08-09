import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import {
  EMBEDDED_MIGRATIONS,
  runMigrations,
  splitStatements,
} from '../src/domain/migrations';

/**
 * AS-1 dual-migration drift guard (design W2, task 1.4).
 *
 * auth_sessions DDL must land identically in BOTH migration systems:
 *   - packages/core embedded migrations array (packages/core/src/domain/migrations.ts)
 *   - legacy on-disk SQL files (modules/core/db/migrations/*.sql)
 *
 * The legacy runner (modules/core/db/migrations.ts) imports 'server-only' and is
 * therefore NOT reachable from packages/core tests; the legacy side is replayed
 * from the on-disk SQL files with the same statement splitter.
 *
 * Only the auth_sessions object DDL is compared — NOT the whole schema, because
 * a pre-existing is_active DEFAULT drift between the two systems (embedded DEFAULT 1
 * vs legacy DEFAULT 0) must not fail this test (0002, out of scope, do not widen).
 */

const LEGACY_MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../modules/core/db/migrations/', import.meta.url),
);

function newDb(): Client {
  return createClient({ url: ':memory:' });
}

/**
 * Replays the legacy on-disk migrations exactly as the modules runner applies them:
 * files sorted by name, split into statements, executed one by one.
 */
async function applyLegacyMigrations(client: Client): Promise<void> {
  const files = readdirSync(LEGACY_MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(LEGACY_MIGRATIONS_DIR, file), 'utf-8');
    for (const stmt of splitStatements(sql)) {
      await client.execute(stmt);
    }
  }
}

interface DdlObject {
  type: string;
  name: string;
  sql: string;
}

/** Only the auth_sessions table plus its idx_auth_sessions_* indexes. */
async function authSessionsDdl(client: Client): Promise<DdlObject[]> {
  const res = await client.execute(`
    SELECT type, name, sql FROM sqlite_master
    WHERE (type = 'table' AND name = 'auth_sessions')
       OR (type = 'index' AND name LIKE 'idx_auth_sessions_%')
    ORDER BY name
  `);
  return res.rows.map((r) => {
    const row = r as unknown as DdlObject;
    return { type: row.type, name: row.name, sql: row.sql };
  });
}

const EXPECTED_COLUMNS = [
  'id',
  'tenant_id',
  'user_id',
  'device_name',
  'user_agent',
  'ip',
  'created_at',
  'last_used_at',
  'expires_at',
  'revoked_at',
  'refresh_hash',
  'lineage_id',
  'prev_hash',
];

// Alphabetical — matches the ORDER BY name in authSessionsDdl().
const EXPECTED_INDEXES = [
  'idx_auth_sessions_lineage',
  'idx_auth_sessions_refresh_hash',
  'idx_auth_sessions_user',
];

describe('auth_sessions dual-migration drift (AS-1)', () => {
  it('embedded runner creates auth_sessions with the full AS-1 column set and composite PK', async () => {
    const db = newDb();
    await runMigrations(db);

    const table = await db.execute(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'`,
    );
    expect(table.rows).toHaveLength(1);

    const ddl = String((table.rows[0] as unknown as { sql: unknown }).sql);
    expect(ddl).toContain('PRIMARY KEY (tenant_id, id)');

    const cols = await db.execute(`PRAGMA table_info(auth_sessions)`);
    const names = cols.rows.map((r) => (r as unknown as { name: string }).name);
    expect(names).toEqual(EXPECTED_COLUMNS);
  });

  it('embedded runner creates the three auth_sessions indexes, including the partial unique refresh_hash index', async () => {
    const db = newDb();
    await runMigrations(db);

    const ddl = await authSessionsDdl(db);
    expect(ddl).toHaveLength(1 + EXPECTED_INDEXES.length);

    const indexNames = ddl.filter((o) => o.type === 'index').map((o) => o.name);
    expect(indexNames).toEqual(EXPECTED_INDEXES);

    const refreshHash = ddl.find(
      (o) => o.name === 'idx_auth_sessions_refresh_hash',
    );
    expect(refreshHash?.sql).toContain('UNIQUE INDEX');
    expect(refreshHash?.sql).toContain('WHERE refresh_hash IS NOT NULL');
  });

  it('legacy runner (replayed from disk) produces identical auth_sessions DDL', async () => {
    const embeddedDb = newDb();
    await runMigrations(embeddedDb);

    const legacyDb = newDb();
    await applyLegacyMigrations(legacyDb);

    expect(await authSessionsDdl(embeddedDb)).toEqual(
      await authSessionsDdl(legacyDb),
    );
  });

  it('0003_auth_sessions.sql on disk is a byte-identical twin of the embedded migration', () => {
    const disk = readFileSync(
      join(LEGACY_MIGRATIONS_DIR, '0003_auth_sessions.sql'),
      'utf-8',
    );
    const embedded = EMBEDDED_MIGRATIONS.find(
      (m) => m.version === '0003_auth_sessions',
    );
    expect(embedded).toBeDefined();
    expect(disk).toBe(embedded!.sql);
  });

  it('refresh_hash uniqueness and the (tenant_id, id) primary key are enforced at runtime', async () => {
    const db = newDb();
    await runMigrations(db);
    await db.execute({
      sql: `INSERT INTO users (tenant_id, username, role, credential_hash)
            VALUES ('default', 'u1', 'member', 'x')`,
    });

    const insertSession = (id: string, refreshHash: string) =>
      db.execute({
        sql: `INSERT INTO auth_sessions (id, tenant_id, user_id, expires_at, refresh_hash, lineage_id)
              VALUES (?, 'default', 1, datetime('now', '+30 days'), ?, 'lin-1')`,
        args: [id, refreshHash],
      });

    await insertSession('s1', 'hash-abc');

    // Same refresh_hash on another row -> partial unique index rejects it (AS-1).
    await expect(insertSession('s2', 'hash-abc')).rejects.toThrow();
    // Same (tenant_id, id) -> composite primary key rejects it.
    await expect(insertSession('s1', 'hash-xyz')).rejects.toThrow();
  });
});
