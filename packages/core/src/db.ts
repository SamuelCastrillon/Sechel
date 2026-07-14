import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import { createClient } from '@libsql/client';
import { runMigrations } from './domain/migrations.js';
import type { CortexDB } from './types.js';

export interface DbOptions {
  /** Database URL: libsql://..., file:..., :memory:, https://... */
  url: string;
  /** Auth token for Turso remote databases */
  authToken?: string;
  /**
   * Runtime detection mode.
   * - 'auto' (default): detect Node.js vs edge automatically
   * - 'node': force @libsql/client Node.js driver
   * - 'edge': force @libsql/client/web (WASM-based edge/worker driver)
   */
  runtime?: 'node' | 'edge' | 'auto';
  /** Tenant ID override. Replaces TENANT_ID() reading process.env */
  tenantId?: string;
}

/**
 * Detect if running in an edge runtime (Cloudflare Workers, etc.).
 */
function isEdgeRuntime(): boolean {
  return typeof (globalThis as any).EdgeRuntime !== 'undefined';
}

/**
 * Detect if running in Node.js.
 */
function isNodeRuntime(): boolean {
  return typeof process?.versions?.node !== 'undefined';
}

/**
 * Create a connected Kysely instance bound to the given database.
 *
 * The factory replaces the old `getDb()` singleton pattern — it always
 * returns a new instance, accepts explicit config, and never reads
 * `process.env` or imports `server-only`.
 *
 * @example
 * ```ts
 * // In-memory (testing)
 * const db = await createDb({ url: ':memory:' });
 *
 * // Local SQLite file
 * const db = await createDb({ url: 'file:./data.db' });
 *
 * // Turso remote
 * const db = await createDb({ url: 'libsql://db.turso.io', authToken: 'eyJ...' });
 * ```
 */
export async function createDb(options: DbOptions): Promise<Kysely<CortexDB>> {
  if (!options.url) {
    throw new Error('createDb: url is required');
  }

  const runtime = resolveRuntime(options);
  const client = createClient({
    url: options.url,
    authToken: options.authToken,
  });

  // Run schema migrations idempotently whenever a database is created.
  // Safe for local SQLite, :memory:, and remote Turso databases.
  await runMigrations(client);

  return new Kysely<CortexDB>({
    dialect: new LibsqlDialect({ client }),
  });
}

function resolveRuntime(options: DbOptions): 'node' | 'edge' {
  if (options.runtime && options.runtime !== 'auto') return options.runtime;
  if (isEdgeRuntime()) return 'edge';
  if (isNodeRuntime()) return 'node';
  return 'node';
}

export { isEdgeRuntime, isNodeRuntime };
