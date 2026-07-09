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

async function createMember(username: string, project: string, permission: string): Promise<Actor> {
  const ins = await db
    .insertInto('users')
    .values({ tenant_id: 'default', username, role: 'member', credential_hash: 'x' })
    .executeTakeFirstOrThrow();
  const userId = Number(ins.insertId);
  await db
    .insertInto('user_project_access')
    .values({ tenant_id: 'default', user_id: userId, project, permission, granted_by: admin.userId })
    .execute();
  return { userId, role: 'member', username };
}

describe('authorize — L2 per-project RBAC', () => {
  it('admin sees all projects regardless of grants', async () => {
    await saveObservation(db, admin, { title: 'a', content: 'secret a', type: 'manual', project: 'proj-secret' });
    const r = await searchObservations(db, admin, { query: 'secret', project: 'proj-secret' });
    expect(r.length).toBe(1);
  });

  it('member with read grant can search but cannot save (needs write)', async () => {
    await saveObservation(db, admin, { title: 'shared', content: 'shared content here', type: 'manual', project: 'proj-a' });
    const member = await createMember('m1', 'proj-a', 'read');

    const found = await searchObservations(db, member, { query: 'shared', project: 'proj-a' });
    expect(found.length).toBe(1);

    await expect(
      saveObservation(db, member, { title: 'nope', content: 'should fail', type: 'manual', project: 'proj-a' }),
    ).rejects.toThrow(/Forbidden/);
  });

  it('member with write grant can save and search', async () => {
    const member = await createMember('m2', 'proj-a', 'write');
    const saved = await saveObservation(db, member, { title: 'ok', content: 'writer content', type: 'manual', project: 'proj-a' });
    expect(saved.action).toBe('inserted');
    const found = await searchObservations(db, member, { query: 'writer', project: 'proj-a' });
    expect(found.length).toBe(1);
  });

  it('member without grant on a project gets empty results and cannot write', async () => {
    await saveObservation(db, admin, { title: 'hidden', content: 'hidden content', type: 'manual', project: 'proj-b' });
    const member = await createMember('m3', 'proj-a', 'read');

    // No grant on proj-b => rejected (403), never silently returns rows.
    await expect(
      searchObservations(db, member, { query: 'hidden', project: 'proj-b' }),
    ).rejects.toThrow(/Forbidden/);

    await expect(
      saveObservation(db, member, { title: 'x', content: 'y', type: 'manual', project: 'proj-b' }),
    ).rejects.toThrow(/Forbidden/);
  });
});
