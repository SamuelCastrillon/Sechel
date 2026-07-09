import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import { saveObservation } from '@/modules/core/domain';
import { doctorDiagnostics } from '@/modules/core/domain/store-admin';
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

describe('mem_doctor — doctorDiagnostics', () => {
  it('returns zero counts for an empty database', async () => {
    const result = await doctorDiagnostics(db, admin, {});

    expect(result.observations).toBe(0);
    expect(result.sessions).toBe(0);
    expect(result.user_prompts).toBe(0);
    expect(result.memory_relations).toBe(0);
    expect(result.conflict_candidates).toBe(0);
    expect(result.orphaned_relations).toBe(0);
    expect(result.newest_observation).toBeNull();
    expect(result.surface_issues).toEqual([]);
  });

  it('returns non-zero counts after inserting data', async () => {
    await saveObservation(db, admin, {
      title: 'Test memory',
      content: 'Test content',
      type: 'manual',
      project: 'cortext',
    });

    await saveObservation(db, admin, {
      title: 'Another memory',
      content: 'More content',
      type: 'decision',
      project: 'cortext',
      topic_key: 'architecture/test',
    });

    const result = await doctorDiagnostics(db, admin, {});
    expect(result.observations).toBe(2);
    expect(result.sessions).toBeGreaterThan(0); // saveObservation creates sessions
    expect(result.newest_observation).not.toBeNull();
    expect(result.surface_issues).toEqual([]);
  });
});
