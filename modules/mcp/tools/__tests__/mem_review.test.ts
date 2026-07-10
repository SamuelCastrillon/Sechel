import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import { saveObservation } from '@/modules/core/domain';
import { reviewObservations } from '@/modules/core/domain/store-admin';
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

describe('mem_review — reviewObservations', () => {
  it('list returns empty when no observations are due', async () => {
    const result = await reviewObservations(db, admin, {
      action: 'list',
    });
    expect('due' in result).toBe(true);
    if ('due' in result) {
      expect(result.due).toHaveLength(0);
    }
  });

  it('list returns due observations with past review_after', async () => {
    // Create an observation, then force review_after to the past via SQL
    const obs = await saveObservation(db, admin, {
      title: 'Old bugfix',
      content: 'Fix for an old issue',
      type: 'bugfix',
      project: 'sechel',
    });

    await db.updateTable('observations')
      .set({ review_after: '2020-01-01T00:00:00.000Z' })
      .where('id', '=', obs.id)
      .execute();

    const result = await reviewObservations(db, admin, {
      action: 'list',
    });

    expect('due' in result).toBe(true);
    if ('due' in result) {
      expect(result.due.length).toBeGreaterThanOrEqual(1);
      expect(result.due[0].id).toBe(obs.id);
    }
  });

  it('mark_reviewed updates review_after for a due observation', async () => {
    const obs = await saveObservation(db, admin, {
      title: 'Memory to mark',
      content: 'Some content',
      type: 'manual',
      project: 'sechel',
    });

    // Force review_after to the past
    await db.updateTable('observations')
      .set({ review_after: '2020-01-01T00:00:00.000Z' })
      .where('id', '=', obs.id)
      .execute();

    const result = await reviewObservations(db, admin, {
      action: 'mark_reviewed',
      id: obs.id,
    });

    expect('success' in result).toBe(true);
    if ('success' in result) {
      expect(result.success).toBe(true);
    }

    // Verify review_after was updated (no longer the past date)
    const updated = await db.selectFrom('observations')
      .select('review_after')
      .where('id', '=', obs.id)
      .executeTakeFirstOrThrow();

    // For 'manual' type, computeNextReview returns null → clears review_after
    expect(updated.review_after).toBeNull();
  });

  it('mark_reviewed throws for non-existent observation', async () => {
    await expect(reviewObservations(db, admin, {
      action: 'mark_reviewed',
      id: 99999,
    })).rejects.toThrow('Observation not found');
  });

  it('mark_reviewed throws when id is missing', async () => {
    await expect(reviewObservations(db, admin, {
      action: 'mark_reviewed',
    } as any)).rejects.toThrow('id is required for mark_reviewed action');
  });
});
