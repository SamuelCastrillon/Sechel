import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import {
  saveObservation,
  getObservation,
  getStats,
  getCurrentProject,
  suggestTopicKey,
  pinObservation,
  unpinObservation,
  savePrompt,
} from '@/modules/core/domain';
import { startSession, endSession } from '@/modules/core/domain/store-session';
import type { Actor } from '@/modules/core/auth';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { CortexDB } from '@/modules/core/db';

let db: Kysely<CortexDB>;
let admin: Actor;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  admin = { userId: Number(t.admin.id), role: 'admin', username: t.admin.username };
});

// ----------------------------------------------------------------------------
// P1 — Lectura simple
// ----------------------------------------------------------------------------

describe('mem_get_observation — P1', () => {
  it('returns observation by id', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'test obs',
      content: 'test content here',
      type: 'manual',
      project: 'p',
    });
    const found = await getObservation(db, admin, { id: saved.id });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(saved.id);
    expect(found!.title).toBe('test obs');
  });

  it('returns null for non-existent id', async () => {
    const found = await getObservation(db, admin, { id: 99999 });
    expect(found).toBeNull();
  });

  it('returns null for soft-deleted observation', async () => {
    const saved = await saveObservation(db, admin, {
      title: 'to delete',
      content: 'will delete',
      type: 'manual',
      project: 'p',
    });
    await sql`UPDATE observations SET deleted_at = datetime('now') WHERE id = ${saved.id}`.execute(db);
    const found = await getObservation(db, admin, { id: saved.id });
    expect(found).toBeNull();
  });

  it('throws on unauthorized actor', async () => {
    const member: Actor = { userId: 999, role: 'member', username: 'noone' };
    await expect(getObservation(db, member, { id: 1 })).rejects.toThrow(/Forbidden/);
  });
});

describe('mem_stats — P1', () => {
  it('returns zeros for empty tenant', async () => {
    const stats = await getStats(db, admin);
    expect(stats.sessions).toBe(0);
    expect(stats.observations).toBe(0);
    expect(stats.prompts).toBe(0);
    expect(stats.projects).toEqual([]);
  });

  it('reflects saved content', async () => {
    await saveObservation(db, admin, { title: 'a', content: 'aa', type: 'manual', project: 'p1' });
    await saveObservation(db, admin, { title: 'b', content: 'bb', type: 'decision', project: 'p2' });
    const stats = await getStats(db, admin);
    expect(stats.observations).toBe(2);
    expect(stats.projects).toContain('p1');
    expect(stats.projects).toContain('p2');
  });
});

describe('mem_current_project — P1', () => {
  it('returns explicit project when provided', async () => {
    const r = await getCurrentProject(db, admin, { project: 'my-project' });
    expect(r.project).toBe('my-project');
    expect(r.project_source).toBe('explicit');
  });

  it('returns null when no activity and no arg', async () => {
    const r = await getCurrentProject(db, admin, {});
    expect(r.project).toBeNull();
    expect(r.project_source).toBe('none');
  });

  it('returns most recent project from activity', async () => {
    await saveObservation(db, admin, { title: 'x', content: 'y', type: 'manual', project: 'recent-proj' });
    const r = await getCurrentProject(db, admin, {});
    expect(r.project).toBe('recent-proj');
    expect(r.project_source).toBe('recent_activity');
    expect(r.available_projects).toContain('recent-proj');
  });
});

describe('mem_suggest_topic_key — P1', () => {
  it('maps type to prefix', () => {
    expect(suggestTopicKey({ title: 'JWT auth', type: 'architecture' }).topic_key).toMatch(/^architecture\//);
    expect(suggestTopicKey({ title: 'bug fix', type: 'bugfix' }).topic_key).toMatch(/^bug\//);
    expect(suggestTopicKey({ title: 'decision 1', type: 'decision' }).topic_key).toMatch(/^decision\//);
  });

  it('defaults to manual/ for unknown types', () => {
    const r = suggestTopicKey({ title: 'note' });
    expect(r.topic_key).toMatch(/^manual\//);
  });

  it('slugifies title', () => {
    const r = suggestTopicKey({ title: 'My Cool Decision!', type: 'decision' });
    expect(r.topic_key).toBe('decision/my-cool-decision');
  });
});

// ----------------------------------------------------------------------------
// P2 — Escritura simple
// ----------------------------------------------------------------------------

describe('mem_pin / mem_unpin — P2', () => {
  it('pins an observation then unpins it', async () => {
    const saved = await saveObservation(db, admin, { title: 'pinme', content: 'content', type: 'manual', project: 'p' });
    const pin = await pinObservation(db, admin, { id: saved.id });
    expect(pin.success).toBe(true);
    const pinned = await getObservation(db, admin, { id: saved.id });
    expect(pinned!.pinned).toBe(1);

    const unpin = await unpinObservation(db, admin, { id: saved.id });
    expect(unpin.success).toBe(true);
    const unpinned = await getObservation(db, admin, { id: saved.id });
    expect(unpinned!.pinned).toBe(0);
  });

  it('throws on non-existent id', async () => {
    await expect(pinObservation(db, admin, { id: 99999 })).rejects.toThrow('Observation not found');
  });
});

describe('mem_save_prompt — P2', () => {
  beforeEach(async () => {
    // Ensure session exists for foreign key
    await sql`INSERT INTO sessions (id, tenant_id, project, directory, started_at)
              VALUES ('prompt-sess', 'default', 'p', '/tmp', datetime('now'))`.execute(db);
  });

  it('saves a prompt and returns id + sync_id', async () => {
    const r = await savePrompt(db, admin, {
      content: 'user asked something',
      session_id: 'prompt-sess',
      project: 'my-proj',
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.sync_id).toMatch(/^prompt-/);

    const row = await db
      .selectFrom('user_prompts')
      .selectAll()
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow();
    expect(row.content).toBe('user asked something');
    expect(row.project).toBe('my-proj');
  });

  it('rejects empty content', async () => {
    await expect(
      savePrompt(db, admin, { content: '', session_id: 's-1' } as any),
    ).rejects.toThrow();
  });
});

describe('mem_session_start / mem_session_end — P2', () => {
  it('starts and ends a session', async () => {
    const start = await startSession(db, admin, {
      id: 'sess-p2-test',
      project: 'p',
      directory: '/tmp',
    });
    expect(start.id).toBe('sess-p2-test');

    const end = await endSession(db, admin, { id: 'sess-p2-test', summary: 'done' });
    expect(end.success).toBe(true);
  });

  it('throws ending non-existent session', async () => {
    await expect(endSession(db, admin, { id: 'no-such-session' })).rejects.toThrow('Session not found');
  });
});
