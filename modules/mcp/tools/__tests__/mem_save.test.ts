import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import { saveObservation, searchObservations } from '@/modules/core/domain';
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

describe('mem_save — L1 Engram parity', () => {
  it('same topic_key twice => one row, revision_count increments, no second row', async () => {
    const a = await saveObservation(db, admin, {
      title: 'JWT auth',
      content: 'Use middleware',
      type: 'decision',
      project: 'cortext',
      scope: 'project',
      topic_key: 'architecture/jwt',
    });
    expect(a.action).toBe('inserted');
    expect(a.revision_count).toBe(1);

    const b = await saveObservation(db, admin, {
      title: 'JWT auth v2',
      content: 'Updated middleware guidance',
      type: 'decision',
      project: 'cortext',
      scope: 'project',
      topic_key: 'architecture/jwt',
    });
    expect(b.action).toBe('updated');
    expect(b.id).toBe(a.id);
    expect(b.revision_count).toBe(2);

    const res = await db
      .selectFrom('observations')
      .select(({ fn }) => [fn.countAll().as('c')])
      .where('tenant_id', '=', 'default')
      .where('topic_key', '=', 'architecture/jwt')
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();
    expect(Number(res.c)).toBe(1);
  });

  it('identical content within 15 min (no topic_key) => duplicate_count increments, no new row', async () => {
    const a = await saveObservation(db, admin, {
      title: 'Same title',
      content: 'identical body',
      type: 'manual',
      project: 'cortext',
    });
    expect(a.action).toBe('inserted');
    expect(a.duplicate_count).toBe(1);

    const b = await saveObservation(db, admin, {
      title: 'Same title',
      content: 'identical body',
      type: 'manual',
      project: 'cortext',
    });
    expect(b.action).toBe('deduped');
    expect(b.id).toBe(a.id);
    expect(b.duplicate_count).toBe(2);

    const res = await db
      .selectFrom('observations')
      .select(({ fn }) => [fn.countAll().as('c')])
      .where('tenant_id', '=', 'default')
      .where('title', '=', 'Same title')
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();
    expect(Number(res.c)).toBe(1);
  });

  it('different content => produces a second row', async () => {
    await saveObservation(db, admin, { title: 'A', content: 'alpha', type: 'manual', project: 'cortext' });
    await saveObservation(db, admin, { title: 'B', content: 'beta', type: 'manual', project: 'cortext' });
    const res = await db
      .selectFrom('observations')
      .select(({ fn }) => [fn.countAll().as('c')])
      .where('tenant_id', '=', 'default')
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();
    expect(Number(res.c)).toBe(2);
  });

  it('conflict surfacing => judgment_required true + candidates[] on related saves', async () => {
    await saveObservation(db, admin, {
      title: 'JWT auth design',
      content: 'JWT auth middleware recommended for the server',
      type: 'decision',
      project: 'cortext',
      scope: 'project',
      topic_key: 'architecture/jwt-a',
    });
    // Second save's text is a word-subset of the first, so the AND FTS query
    // (derived from the saved item) deterministically matches the first row.
    const b = await saveObservation(db, admin, {
      title: 'JWT auth design',
      content: 'JWT auth middleware recommended',
      type: 'decision',
      project: 'cortext',
      scope: 'project',
      topic_key: 'architecture/jwt-b',
    });
    expect(b.action).toBe('inserted');
    expect(b.judgment_required).toBe(true);
    expect(b.candidates.length).toBeGreaterThanOrEqual(1);
    expect(b.candidates[0].judgment_id).toBeTruthy();
  });
});

describe('mem_search — L1 Engram parity', () => {
  it('FTS5 bm25 ranking is deterministic (closer-to-0 ranks first)', async () => {
    const jwt = await saveObservation(db, admin, {
      title: 'jwt auth middleware',
      content: 'jwt auth is the recommended middleware approach',
      type: 'decision',
      project: 'cortext',
    });
    await saveObservation(db, admin, {
      title: 'cats are nice',
      content: 'a totally unrelated note about cats and weather',
      type: 'manual',
      project: 'cortext',
    });
    const results = await searchObservations(db, admin, { query: 'jwt auth', project: 'cortext' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(jwt.id);
    // bm25 rank is negative; first result must be >= (less negative than) later ones
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].rank).toBeLessThanOrEqual(results[i].rank);
    }
  });

  it('direct topic_key match when query contains "/" => pinned rank -1000, sorted first', async () => {
    const target = await saveObservation(db, admin, {
      title: 'Pinned architecture note',
      content: 'architecture detail',
      type: 'decision',
      project: 'cortext',
      scope: 'project',
      topic_key: 'architecture/pinned',
    });
    await saveObservation(db, admin, {
      title: 'noise',
      content: 'architecture noise content here',
      type: 'manual',
      project: 'cortext',
      scope: 'project',
      topic_key: 'architecture/other',
    });
    const results = await searchObservations(db, admin, {
      query: 'architecture/pinned',
      project: 'cortext',
    });
    expect(results[0].id).toBe(target.id);
    expect(results[0].rank).toBe(-1000);
  });

  it('match_mode=any broadens recall vs all', async () => {
    await saveObservation(db, admin, {
      title: 'auth strategy',
      content: 'discussion about authentication strategy',
      type: 'decision',
      project: 'cortext',
    });
    const all = await searchObservations(db, admin, { query: 'auth nonsense', project: 'cortext', match_mode: 'all' });
    const any = await searchObservations(db, admin, { query: 'auth nonsense', project: 'cortext', match_mode: 'any' });
    expect(any.length).toBeGreaterThanOrEqual(all.length);
  });
});
