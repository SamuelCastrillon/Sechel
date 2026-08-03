/**
 * Dev entry point — creates a local SQLite DB, runs migrations, seeds admin,
 * and starts the server with a shared Kysely instance.
 *
 * Usage: npx tsx apps/server/dev.ts
 */
import { serve } from '@hono/node-server';
import { createClient } from '@libsql/client';
import { createDb, runMigrations } from '@sechel-mcp/core';
import { createApp } from './src/index.js';
import { seedAdmin } from './src/admin/seed.js';

const DB_PATH = 'sechel-dev.db';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-for-local-testing-only-32chars!!';
const TENANT_ID = process.env.TENANT_ID || 'default';
const PORT = parseInt(process.env.PORT || '3001', 10);

// Ensure env vars are set for the MCP handler (reads from env)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${DB_PATH}`;
}
if (!process.env.SECHEL_DEV_TOKEN) {
  process.env.SECHEL_DEV_TOKEN = 'sk-dev-token';
}

async function main() {
  // 1. Create raw client, run migrations, seed admin
  const client = createClient({ url: `file:${DB_PATH}` });
  await runMigrations(client);
  await seedAdmin(client, TENANT_ID, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  client.close();

  // 2. Create shared Kysely instance
  const db = await createDb({ url: `file:${DB_PATH}` });

  // 3. Create the app with shared DB + JWT secret
  const app = createApp({ db, jwtSecret: JWT_SECRET });

  // 4. Start the server
  console.log(`Sechel dev server starting on http://localhost:${PORT}`);
  console.log(`  Admin health: GET /admin/health`);
  console.log(`  Admin login:  POST /admin/auth/login`);
  console.log(`  Admin users:  GET /admin/users`);
  console.log(`  Admin tokens: GET /admin/tokens`);
  console.log(`  Admin settings: GET /admin/settings`);
  console.log(`  MCP endpoint: POST /mcp`);
  console.log(`  Login: { "username": "${ADMIN_USERNAME}", "password": "${ADMIN_PASSWORD}" }`);

  serve({ fetch: app.fetch, port: PORT });
}

main().catch((err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
