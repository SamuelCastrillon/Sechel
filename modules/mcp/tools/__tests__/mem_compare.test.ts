import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import { saveObservation } from '@/modules/core/domain';
import { compareMemories } from '@/modules/core/domain/store-relations';
import type { Actor } from '@/modules/core/auth';
import type { Kysely } from 'kysely';
import type { CortexDB } from '@/modules/core/db';

let db: Kysely<CortexDB>;
let admin: Actor;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  admin = { userId: Number(t.admin.id), role: 'admin', username: t.admin.username };
});

describe('mem_compare — compareMemories', () => {
  it('inserts a relation row for non-not_conflict verdict', async () => {
    const a = await saveObservation(db, admin, {
      title: 'Memory A',
      content: 'Content A',
      type: 'manual',
      project: 'sechel',
    });
    const b = await saveObservation(db, admin, {
      title: 'Memory B',
      content: 'Content B',
      type: 'manual',
      project: 'sechel',
    });

    const result = await compareMemories(db, admin, {
      memory_id_a: a.id,
      memory_id_b: b.id,
      relation: 'related',
      confidence: 0.8,
      reasoning: 'They share the same project context',
      model: 'claude-haiku-4-5',
    });

    expect(result.sync_id).toBeTruthy();
    expect(result.sync_id).toMatch(/^rel-/);

    // Verify the row exists
    const row = await db.selectFrom('memory_relations')
      .selectAll()
      .where('sync_id', '=', result.sync_id)
      .executeTakeFirstOrThrow();

    expect(row.relation).toBe('related');
    expect(row.judgment_status).toBe('judged');
    expect(row.reason).toBe('They share the same project context');
  });

  it('not_conflict returns empty sync_id and no row', async () => {
    const a = await saveObservation(db, admin, {
      title: 'Memory C',
      content: 'Content C',
      type: 'manual',
      project: 'sechel',
    });
    const b = await saveObservation(db, admin, {
      title: 'Memory D',
      content: 'Content D',
      type: 'manual',
      project: 'sechel',
    });

    const result = await compareMemories(db, admin, {
      memory_id_a: a.id,
      memory_id_b: b.id,
      relation: 'not_conflict',
    });

    expect(result.sync_id).toBe('');

    // No row should exist
    const count = await db.selectFrom('memory_relations')
      .select(({ fn }) => [fn.countAll().as('c')])
      .executeTakeFirstOrThrow();
    expect(Number(count.c)).toBe(0);
  });

  it('throws when observation does not exist', async () => {
    await expect(compareMemories(db, admin, {
      memory_id_a: 99999,
      memory_id_b: 99998,
      relation: 'related',
    })).rejects.toThrow('Observation not found');
  });
});
