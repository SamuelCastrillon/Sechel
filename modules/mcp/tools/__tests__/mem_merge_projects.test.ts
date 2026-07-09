import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import { saveObservation } from '@/modules/core/domain';
import { mergeProjects } from '@/modules/core/domain/store-admin';
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

describe('mem_merge_projects — mergeProjects', () => {
  it('renames project across observations', async () => {
    await saveObservation(db, admin, {
      title: 'Memory in project-a',
      content: 'Content for project-a',
      type: 'manual',
      project: 'project-a',
    });

    await saveObservation(db, admin, {
      title: 'Another in project-a',
      content: 'More content for project-a',
      type: 'manual',
      project: 'project-a',
    });

    // Observation in a different project to ensure no cross-contamination
    await saveObservation(db, admin, {
      title: 'Memory in project-b',
      content: 'Stays in project-b',
      type: 'manual',
      project: 'project-b',
    });

    const result = await mergeProjects(db, admin, {
      from: 'project-a',
      to: 'project-c',
    });

    expect(result.success).toBe(true);

    // Verify project-a observations are now project-c
    const aObs = await db.selectFrom('observations')
      .selectAll()
      .where('project', '=', 'project-c')
      .where('deleted_at', 'is', null)
      .execute();

    expect(aObs).toHaveLength(2);
    expect(aObs[0].title).toBe('Memory in project-a');

    // project-b should still have its observation
    const bObs = await db.selectFrom('observations')
      .selectAll()
      .where('project', '=', 'project-b')
      .where('deleted_at', 'is', null)
      .execute();

    expect(bObs).toHaveLength(1);
  });

  it('no-op when from equals to', async () => {
    await saveObservation(db, admin, {
      title: 'Test',
      content: 'Content',
      type: 'manual',
      project: 'my-project',
    });

    const result = await mergeProjects(db, admin, {
      from: 'my-project',
      to: 'my-project',
    });

    expect(result.success).toBe(true);

    const count = await db.selectFrom('observations')
      .select(({ fn }) => [fn.countAll().as('c')])
      .where('project', '=', 'my-project')
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();

    expect(Number(count.c)).toBe(1);
  });
});
