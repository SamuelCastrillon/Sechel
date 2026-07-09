import { Kysely } from "kysely";
import { LibsqlDialect } from "kysely-libsql";
import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CortexDB, UserRow } from "./db-types";
import { runMigrations } from "./migrations";

/**
 * Single per-instance org id. NOT user-supplied. Scopes every query so a bug
 * cannot cross instance boundaries (defense-in-depth on top of per-project auth).
 */
export function TENANT_ID(): string {
  return process.env.CORTEXT_ORG_ID ?? "default";
}

// SLICE 1 DEV BYPASS (documented, not a silent no-op):
// Real bearer -> users auth lands in Slice 3. For Slice 1 we seed one admin
// account so the server is usable and parity tests pass. This is a constant
// placeholder credential and MUST be replaced by real auth in Slice 3.
export const DEV_ADMIN_USERNAME = "dev-admin";
export const DEV_ADMIN_CREDENTIAL_HASH = "dev-bypass-not-for-production";

function resolveUrl(): { url: string; token?: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (url) return { url, token };
  // Local dev default: ephemeral file DB so the app runs without Turso.
  return { url: "file:./.cortext-local.db" };
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

/** Seed the dev-admin account if none exists for the tenant. Returns the user row. */
export async function seedAdmin(client: Client): Promise<UserRow> {
  const tenantId = TENANT_ID();
  const existing = await client.execute({
    sql: `SELECT * FROM users WHERE tenant_id = ? AND username = ? LIMIT 1`,
    args: [tenantId, DEV_ADMIN_USERNAME],
  });
  if (existing.rows.length > 0) {
    return existing.rows[0] as unknown as UserRow;
  }
  await client.execute({
    sql: `INSERT INTO users (tenant_id, username, role, credential_hash, created_at)
          VALUES (?, ?, 'admin', ?, datetime('now'))`,
    args: [tenantId, DEV_ADMIN_USERNAME, DEV_ADMIN_CREDENTIAL_HASH],
  });
  const created = await client.execute({
    sql: `SELECT * FROM users WHERE tenant_id = ? AND username = ? LIMIT 1`,
    args: [tenantId, DEV_ADMIN_USERNAME],
  });
  return created.rows[0] as unknown as UserRow;
}
