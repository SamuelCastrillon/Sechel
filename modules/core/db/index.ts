import 'server-only';
import { Kysely } from 'kysely';
import { LibsqlDialect } from 'kysely-libsql';
import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CortexDB, UserRow } from './db-types';
import { runMigrations } from './migrations';
import { seedAdmin } from './seed';

/**
 * Single per-instance org id. NOT user-supplied. Scopes every query so a bug
 * cannot cross instance boundaries (defense-in-depth on top of per-project auth).
 */
export function TENANT_ID(): string {
  return process.env.CORTEXT_ORG_ID ?? 'default';
}

function resolveUrl(): { url: string; token?: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (url) return { url, token };
  // Local dev default: ephemeral file DB so the app runs without Turso.
  return { url: 'file:./.cortext-local.db' };
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
  const url = `file:${join(tmpdir(), `cortext-test-${randomUUID()}.turso`)}`;
  const client = createClient({ url });
  await runMigrations(client);
  const admin = await seedAdmin(client);
  const db = new Kysely<CortexDB>({ dialect: new LibsqlDialect({ client }) });
  return { db, client, admin };
}

export { DEV_ADMIN_USERNAME, DEV_ADMIN_CREDENTIAL_HASH, seedAdmin } from './seed';
export * from './db-types';
export { runMigrations, splitStatements } from './migrations';
