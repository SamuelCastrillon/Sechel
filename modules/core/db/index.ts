import 'server-only';
import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getEnv } from './env';
import type { CortexDB, UserRow } from './db-types';
import { runMigrations } from './migrations';
import { seedAdmin } from './seed';

/**
 * Single per-instance org id. NOT user-supplied. Scopes every query so a bug
 * cannot cross instance boundaries (defense-in-depth on top of per-project auth).
 */
export function TENANT_ID(): string {
  return getEnv('SECHEL_ORG_ID', 'CORTEXT_ORG_ID', 'default')!;
}

export function resolveUrl(): { url: string; token?: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (url) return { url, token };

  // Local dev default: ephemeral file DB so the app runs without Turso.
  const oldPath = join(process.cwd(), '.cortext-local.db');
  const newPath = join(process.cwd(), '.sechel-local.db');

  // Auto-migrate: copy old DB to new path if new doesn't exist
  if (!existsSync(newPath) && existsSync(oldPath)) {
    cpSync(oldPath, newPath);
    console.log('[sechel] Migrated local DB: .cortext-local.db → .sechel-local.db');
  }

  return { url: 'file:./.sechel-local.db' };
}

export function createLibsqlClient(): Client {
  const { url, token } = resolveUrl();
  return createClient({ url, authToken: token });
}

let clientSingleton: Client | null = null;
let dbSingleton: Kysely<CortexDB> | null = null;
let initialized = false;

function getClient(): Client {
  if (!clientSingleton) clientSingleton = createLibsqlClient();
  return clientSingleton;
}

/** Returns the Kysely instance for the app, running migrations + admin seed once. */
export async function getDb(): Promise<Kysely<CortexDB>> {
  if (!dbSingleton) {
    dbSingleton = new Kysely<CortexDB>({
      dialect: new LibsqlDialect({ client: getClient() }),
    });
  }
  if (!initialized) {
    await runMigrations(getClient());
    await seedAdmin(getClient());
    initialized = true;
  }
  return dbSingleton;
}

/** Create a fresh, fully-isolated libSQL database for tests (temp .turso file). */
export async function createTestDb(): Promise<{
  db: Kysely<CortexDB>;
  client: Client;
  admin: UserRow;
}> {
  const url = `file:${join(tmpdir(), `sechel-test-${randomUUID()}.turso`)}`;
  const client = createClient({ url });
  await runMigrations(client);
  // Pass explicit test credentials so seedAdmin is never env-var dependent
  const admin = await seedAdmin(client, {
    username: 'test-admin',
    password: 'test-password-for-tests',
  }) as UserRow;
  const db = new Kysely<CortexDB>({ dialect: new LibsqlDialect({ client }) });
  return { db, client, admin };
}

export { seedAdmin } from './seed';
export * from './db-types';
export { runMigrations, splitStatements } from './migrations';
