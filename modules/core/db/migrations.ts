import 'server-only';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from '@libsql/client';

/**
 * Versioned migrations. The canonical source of truth is `migrations/0001_init.sql`
 * (reviewed by humans / the orchestrator). This runtime copy is embedded so the runner
 * works identically in dev, vitest, and Vercel (where reading arbitrary files from the
 * deployed bundle is not guaranteed). The two MUST stay in sync.
 *
 * If the on-disk `migrations/` directory is present (dev / vitest), the runner prefers
 * it; otherwise it falls back to this embedded array.
 */
export interface Migration {
  version: string;
  sql: string;
}

function safeRead(p: string): string {
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

// Runtime fallback copy of migrations/0001_init.sql (see header note). In dev and
// vitest the on-disk migrations/ directory is preferred; this only loads if that
// directory is unavailable (e.g. some bundled deployments).
const EMBEDDED_MIGRATIONS: Migration[] = [
  { version: '0001_init', sql: safeRead(join(process.cwd(), 'migrations', '0001_init.sql')) },
].filter((m) => m.sql.length > 0);

function loadMigrations(): Migration[] {
  const dir = join(process.cwd(), 'migrations');
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      if (files.length > 0) {
        return files.map((f) => ({
          version: f.replace(/\.sql$/, ''),
          sql: readFileSync(join(dir, f), 'utf-8'),
        }));
      }
    } catch {
      // fall through to embedded
    }
  }
  return EMBEDDED_MIGRATIONS;
}

/**
 * Split a SQL script into individual statements.
 * Respects BEGIN ... END blocks (e.g. FTS5 sync triggers contain inner semicolons)
 * and ignores semicolons that appear inside string literals is not needed here
 * because the migration SQL contains no semicolons inside string literals.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0; // BEGIN/END (trigger) nesting depth
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const upper5 = sql.slice(i, i + 5).toUpperCase();
    const upper3 = sql.slice(i, i + 3).toUpperCase();
    if (upper5 === 'BEGIN' && /[^A-Za-z]/.test(sql[i + 5] ?? ';')) {
      depth++;
      current += ch;
      i++;
      continue;
    }
    if (upper3 === 'END' && /[^A-Za-z]/.test(sql[i + 3] ?? ';')) {
      depth = Math.max(0, depth - 1);
      current += ch;
      i++;
      continue;
    }
    if (ch === ';' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

/** Apply all pending migrations idempotently (tracked by the `_migrations` table). */
export async function runMigrations(client: Client): Promise<void> {
  // Ensure the tracking table exists first.
  await client.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (version TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (version))`,
  );

  const applied = await client.execute(`SELECT version FROM _migrations`);
  const appliedVersions = new Set(
    applied.rows.map((r) => String((r as Record<string, unknown>).version)),
  );

  for (const migration of loadMigrations()) {
    if (appliedVersions.has(migration.version)) continue;
    const statements = splitStatements(migration.sql);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
    await client.execute({
      sql: `INSERT INTO _migrations (version) VALUES (?)`,
      args: [migration.version],
    });
  }
}
