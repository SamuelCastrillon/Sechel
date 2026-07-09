import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createLibsqlClient } from '../lib/db';
import { runMigrations } from '../lib/migrations';

async function main() {
  const client = createLibsqlClient();
  console.log(
    'Applying migrations to',
    process.env.TURSO_DATABASE_URL ?? 'local default DB (file:./.cortext-local.db)',
  );
  await runMigrations(client);

  const res = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  console.log('Tables now present:');
  for (const row of res.rows) {
    console.log('  -', (row as Record<string, unknown>).name);
  }

  await client.close();
  console.log('Migration complete.');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
