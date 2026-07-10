import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '@/modules/core/db';
import { capturePassive } from '@/modules/core/domain/store-admin';
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

describe('mem_capture_passive — capturePassive', () => {
  it('parses ## Key Learnings and saves observations', async () => {
    const content = `## Summary
Some text before the learning section.

## Key Learnings
1. First learning: use middleware for auth
2. Second learning: always validate input
- Third learning with dash style

## Next Steps
Some next steps`;

    const result = await capturePassive(db, admin, {
      content,
      project: 'sechel',
      source: 'test-session',
    });

    expect(result.saved).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.observations).toHaveLength(3);

    // Verify each observation was created
    expect(result.observations[0].title).toContain('First learning');
    expect(result.observations[1].title).toContain('Second learning');
    expect(result.observations[2].title).toContain('Third learning');
  });

  it('parses ## Aprendizajes Clave (Spanish)', async () => {
    const content = `## Work done
Fixed auth bug

## Aprendizajes Clave
1. JWT tokens must be verified
2. Session timeout must be configurable`;

    const result = await capturePassive(db, admin, {
      content,
      session_id: 'session-123',
    });

    expect(result.saved).toBe(2);
    expect(result.observations).toHaveLength(2);
  });

  it('returns empty when no key learnings section exists', async () => {
    const content = `## Summary
No learnings here.`;

    const result = await capturePassive(db, admin, {
      content,
    });

    expect(result.saved).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.observations).toHaveLength(0);
  });

  it('dedupes duplicate items within same call', async () => {
    const content = `## Key Learnings
1. First item
2. First item
3. Second item`;

    const result = await capturePassive(db, admin, {
      content,
    });

    // First item appears twice but should be deduped
    expect(result.saved).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.observations).toHaveLength(2);
  });
});
