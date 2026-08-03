import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import type { Client } from '@libsql/client';
import { runMigrations } from './domain/migrations.js';
import type { CortexDB } from './types.js';

export interface DbOptions {
  /** Database URL: libsql://..., file:..., :memory:, https://... */
  url: string;
  /** Auth token for Turso remote databases */
  authToken?: string;
  /**
   * Driver selection mode.
   * - 'auto' (default): `file:` / `:memory:` → @libsql/client (native),
   *   `libsql://` / `https://` → @libsql/client/web (HTTP, serverless-safe)
   * - 'node': force @libsql/client Node.js driver
   * - 'edge': force @libsql/client/web (WASM-based HTTP driver)
   */
  runtime?: 'node' | 'edge' | 'auto';
  /** Tenant ID override. Replaces TENANT_ID() reading process.env */
  tenantId?: string;
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

  const useWeb = options.runtime === 'edge'
    || (options.runtime !== 'node' && !options.url.startsWith('file:') && !options.url.startsWith(':memory:'));

  const { createClient } = useWeb
    ? await import('@libsql/client/web')
    : await import('@libsql/client');

  const client: Client = createClient({
    url: options.url,
    authToken: options.authToken,
  }) as unknown as Client;

  // Run schema migrations idempotently whenever a database is created.
  // Safe for local SQLite, :memory:, and remote Turso databases.
  await runMigrations(client);

  return new Kysely<CortexDB>({
    dialect: new LibsqlDialect({ client }),
  });
}


