import { describe, it, expect } from 'vitest';
import { sql } from 'kysely';

describe('createDb', () => {
  it('returns a connected Kysely instance with :memory: url', async () => {
    const { createDb } = await import('../src/db');
    const db = await createDb({ url: ':memory:' });

    // Prove it's connected: run a query via Kysely's sql tag
    const result = await sql<{ connected: number }>`
      SELECT 1 AS connected
    `.execute(db);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].connected).toBe(1);
  });

  it('throws when url is missing', async () => {
    const { createDb } = await import('../src/db');
    await expect(createDb({} as any)).rejects.toThrow('url is required');
  });

  it('returns a Kysely that can create a table and insert/select', async () => {
    const { createDb } = await import('../src/db');
    const db = await createDb({ url: ':memory:' });

    await sql`
      CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, name TEXT)
    `.execute(db);

    await sql`
      INSERT INTO test_table (name) VALUES (${'hello'})
    `.execute(db);

    const rows = await sql<{ name: string }>`
      SELECT name FROM test_table WHERE name = ${'hello'}
    `.execute(db);

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].name).toBe('hello');
  });
});
