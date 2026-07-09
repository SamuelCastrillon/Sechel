import 'server-only';
import { sql, type Kysely } from 'kysely';
import { randomBytes } from 'node:crypto';
import type { CortexDB } from '../db/db-types';
import { TENANT_ID } from '../db';
import { assertAuthorized, type Actor } from '../auth';
import { normalizeProject } from './normalize';
import {
  sessionStartSchema,
  sessionEndSchema,
  type SessionStartInput,
  type SessionEndInput,
} from './validation';
import type { SessionStartResult, SessionEndResult } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genSyncId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

/**
 * Ensure a session exists, creating it if needed.
 * Reused by saveObservation (store.ts) and other domain functions.
 */
export async function ensureSession(
  db: Kysely<CortexDB>,
  tenantId: string,
  sessionId: string | null,
  project: string | null,
): Promise<string> {
  const sid = sessionId ?? genSyncId('sess');
  const existing = await sql<{ id: string }>`
    SELECT id FROM sessions WHERE tenant_id = ${tenantId} AND id = ${sid}
  `.execute(db);
  if (existing.rows[0]) return sid;
  await sql`
    INSERT INTO sessions (id, tenant_id, project, directory, started_at)
    VALUES (${sid}, ${tenantId}, ${project ?? 'unknown'}, 'unknown', datetime('now'))
  `.execute(db);
  return sid;
}

// ---------------------------------------------------------------------------
// mem_session_start -> StartSession (doc §3.13)
// ---------------------------------------------------------------------------

/**
 * Start a new coding session.
 */
export async function startSession(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: SessionStartInput,
): Promise<SessionStartResult> {
  await assertAuthorized(db, actor, input.project, 'write');

  const tenantId = TENANT_ID();
  const project = normalizeProject(input.project);

  await sql`
    INSERT INTO sessions (id, tenant_id, project, directory, started_at)
    VALUES (${input.id}, ${tenantId}, ${project ?? 'unknown'}, ${input.directory}, datetime('now'))
  `.execute(db);

  return { id: input.id };
}

// ---------------------------------------------------------------------------
// mem_session_end / mem_session_summary -> EndSession (doc §3.13)
// ---------------------------------------------------------------------------

/**
 * End a session with optional summary.
 */
export async function endSession(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: SessionEndInput,
): Promise<SessionEndResult> {
  // Auth: we need the session's project for the check
  const tenantId = TENANT_ID();
  const session = await sql<{ project: string }>`
    SELECT project FROM sessions WHERE tenant_id = ${tenantId} AND id = ${input.id}
  `.execute(db);
  if (!session.rows[0]) throw new Error('Session not found');

  await assertAuthorized(db, actor, session.rows[0].project, 'write');

  const r = await sql`
    UPDATE sessions SET ended_at = datetime('now'), summary = ${input.summary ?? null}
    WHERE tenant_id = ${tenantId} AND id = ${input.id}
  `.execute(db);

  if (r.numAffectedRows !== undefined && Number(r.numAffectedRows) === 0) {
    throw new Error('Session not found');
  }

  return { success: true };
}
