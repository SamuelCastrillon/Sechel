import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import { saveObservation } from '@/modules/core/domain';
import { judgeRelation } from '@/modules/core/domain/store-relations';
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

describe('mem_judge — judgeRelation', () => {
  it('judges a pending relation and updates it', async () => {
    // Create two observations to link
    const a = await saveObservation(db, admin, {
      title: 'Obs A',
      content: 'Content A',
      type: 'manual',
      project: 'sechel',
    });
    const b = await saveObservation(db, admin, {
      title: 'Obs B',
      content: 'Content B',
      type: 'manual',
      project: 'sechel',
    });

    // Insert a pending memory_relations row directly (simulating conflict surfacing)
    const relSyncId = `rel-test-${Date.now()}`;
    await db.insertInto('memory_relations').values({
      tenant_id: 'default',
      sync_id: relSyncId,
      source_id: a.sync_id ?? '',
      target_id: b.sync_id ?? '',
      relation: 'conflicts_with',
      judgment_status: 'pending',
      confidence: 1.0,
    }).execute();

    // Judge it
    const result = await judgeRelation(db, admin, {
      judgment_id: relSyncId,
      relation: 'supersedes',
      reason: 'Obs B supersedes A with updated guidance',
      confidence: 0.9,
    });

    expect(result.success).toBe(true);

    // Verify the row was updated
    const row = await db.selectFrom('memory_relations')
      .selectAll()
      .where('sync_id', '=', relSyncId)
      .executeTakeFirstOrThrow();

    expect(row.relation).toBe('supersedes');
    expect(row.judgment_status).toBe('judged');
    expect(row.marked_by_actor).toBe(admin.username);
    expect(row.marked_by_kind).toBe('engram');
  });

  it('throws when relation does not exist', async () => {
    await expect(judgeRelation(db, admin, {
      judgment_id: 'rel-nonexistent',
      relation: 'compatible',
    })).rejects.toThrow('Relation not found');
  });
});
