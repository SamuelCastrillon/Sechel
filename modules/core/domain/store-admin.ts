import 'server-only';
import { sql, type Kysely } from 'kysely';
import type { CortexDB, ObservationsTable } from '../db/db-types';
import { TENANT_ID } from '../db';
import { assertAuthorized, type Actor } from '../auth';
import { normalizeProject } from './normalize';
import { saveObservation } from './store';
import { OBS_COLS, type DoctorResult, type CapturePassiveResult, type CapturedItem } from './types';
import type { ReviewInput, DoctorInput, MergeProjectsInput, CapturePassiveInput } from './validation';

// ---------------------------------------------------------------------------
// P6 — Administrativos
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// mem_review (§3.14)
// ---------------------------------------------------------------------------

const OBS_COLS_REVIEW = `id, tenant_id, sync_id, session_id, type, title, content,
  tool_name, project, scope, topic_key, revision_count, duplicate_count,
  last_seen_at, pinned, review_after, created_at, updated_at`;

/**
 * Compute the next review_after timestamp based on type decay policy.
 * - bugfix → +7 days
 * - architecture / decision → +30 days
 * - pattern / config / discovery / learning → null (never)
 * - manual / other → null
 */
function computeNextReview(type: string): string | null {
  switch (type) {
    case 'bugfix':
      return sql<string>`datetime('now', '+7 days')`.compile().sql;
    case 'architecture':
    case 'decision':
      return sql<string>`datetime('now', '+30 days')`.compile().sql;
    default:
      return null;
  }
}

export async function reviewObservations(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: ReviewInput,
): Promise<{ due: ObservationsTable[] } | { success: boolean }> {
  const tenantId = TENANT_ID();

  if (input.action === 'list') {
    await assertAuthorized(db, actor, null, 'read');
    const project = normalizeProject(input.project);

    const due = await sql<ObservationsTable>`
      SELECT ${sql.raw(OBS_COLS_REVIEW)} FROM observations
      WHERE tenant_id = ${tenantId}
        AND deleted_at IS NULL
        AND review_after IS NOT NULL
        AND datetime(review_after) <= datetime('now')
        ${project !== null ? sql`AND LOWER(project) = ${project}` : sql``}
      ORDER BY datetime(review_after) ASC, id ASC
      LIMIT ${input.limit ?? 10}
    `.execute(db);

    return { due: due.rows as ObservationsTable[] };
  }

  // action === 'mark_reviewed'
  if (!input.id) throw new Error('id is required for mark_reviewed action');
  await assertAuthorized(db, actor, null, 'write');

  // Fetch the observation to get its type for decay computation
  const obs = await sql<{ type: string }>`
    SELECT type FROM observations
    WHERE tenant_id = ${tenantId} AND id = ${input.id} AND deleted_at IS NULL
  `.execute(db);

  if (obs.rows.length === 0) {
    throw new Error(`Observation not found: ${input.id}`);
  }

  const nextReview = computeNextReview(obs.rows[0].type);

  const r = await sql`
    UPDATE observations
    SET review_after = ${nextReview ?? null},
        updated_at = datetime('now')
    WHERE tenant_id = ${tenantId} AND id = ${input.id} AND deleted_at IS NULL
  `.execute(db);

  const affected = r.numAffectedRows !== undefined ? Number(r.numAffectedRows) : 0;
  if (affected === 0) {
    throw new Error(`Observation not found: ${input.id}`);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// mem_doctor (§3.15) — read-only diagnostics
// ---------------------------------------------------------------------------

export async function doctorDiagnostics(
  db: Kysely<CortexDB>,
  actor: Actor,
  _input: DoctorInput,
): Promise<DoctorResult> {
  await assertAuthorized(db, actor, null, 'read');

  const tenantId = TENANT_ID();

  const [countObs, countSessions, countPrompts, countRelations, countPending, countOrphaned, maxCreated] =
    await Promise.all([
      sql<{ c: number }>`
        SELECT COUNT(*) AS c FROM observations WHERE tenant_id = ${tenantId}
      `.execute(db),
      sql<{ c: number }>`
        SELECT COUNT(*) AS c FROM sessions WHERE tenant_id = ${tenantId}
      `.execute(db),
      sql<{ c: number }>`
        SELECT COUNT(*) AS c FROM user_prompts WHERE tenant_id = ${tenantId}
      `.execute(db),
      sql<{ c: number }>`
        SELECT COUNT(*) AS c FROM memory_relations WHERE tenant_id = ${tenantId}
      `.execute(db),
      sql<{ c: number }>`
        SELECT COUNT(*) AS c FROM memory_relations
        WHERE tenant_id = ${tenantId} AND judgment_status = 'pending'
      `.execute(db),
      sql<{ c: number }>`
        SELECT COUNT(*) AS c FROM memory_relations
        WHERE tenant_id = ${tenantId} AND judgment_status = 'orphaned'
      `.execute(db),
      sql<{ created_at: string | null }>`
        SELECT MAX(created_at) AS created_at FROM observations WHERE tenant_id = ${tenantId}
      `.execute(db),
    ]);

  // Surface issues: observations referencing non-existent sessions
  const orphanObs = await sql<{ c: number }>`
    SELECT COUNT(*) AS c FROM observations o
    WHERE o.tenant_id = ${tenantId}
      AND o.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.tenant_id = o.tenant_id AND s.id = o.session_id
      )
  `.execute(db);

  const surfaceIssues: string[] = [];
  if (Number(orphanObs.rows[0].c) > 0) {
    surfaceIssues.push(`${Number(orphanObs.rows[0].c)} observations reference non-existent sessions`);
  }

  return {
    observations: Number(countObs.rows[0].c),
    sessions: Number(countSessions.rows[0].c),
    user_prompts: Number(countPrompts.rows[0].c),
    memory_relations: Number(countRelations.rows[0].c),
    conflict_candidates: Number(countPending.rows[0].c),
    orphaned_relations: Number(countOrphaned.rows[0].c),
    newest_observation: maxCreated.rows[0]?.created_at ?? null,
    surface_issues: surfaceIssues,
  };
}

// ---------------------------------------------------------------------------
// mem_merge_projects (§3.15) — rename project across tables
// ---------------------------------------------------------------------------

export async function mergeProjects(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: MergeProjectsInput,
): Promise<{ success: boolean }> {
  await assertAuthorized(db, actor, null, 'write');

  const tenantId = TENANT_ID();

  // Normalize both names
  const from = input.from.trim().toLowerCase();
  const to = input.to.trim().toLowerCase();

  if (from === to) return { success: true }; // no-op

  await sql`UPDATE observations SET project = ${to}
    WHERE tenant_id = ${tenantId} AND LOWER(project) = ${from}`.execute(db);
  await sql`UPDATE sessions SET project = ${to}
    WHERE tenant_id = ${tenantId} AND LOWER(project) = ${from}`.execute(db);
  await sql`UPDATE user_prompts SET project = ${to}
    WHERE tenant_id = ${tenantId} AND LOWER(project) = ${from}`.execute(db);

  return { success: true };
}

// ---------------------------------------------------------------------------
// mem_capture_passive (§3.15) — parse key learnings and save each as observation
// ---------------------------------------------------------------------------

const KEY_LEARNINGS_RE = /^##\s*(Key Learnings|Aprendizajes Clave)\s*$/im;
const ITEM_RE = /^(?:\d+[.)]\s*|[-*]\s*)(.+)$/m;

export async function capturePassive(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: CapturePassiveInput,
): Promise<CapturePassiveResult> {
  await assertAuthorized(db, actor, input.project ?? null, 'write');

  const lines = input.content.split('\n');
  const sectionStart = lines.findIndex((l) => KEY_LEARNINGS_RE.test(l.trim()));

  if (sectionStart === -1) {
    return { saved: 0, skipped: 0, observations: [] };
  }

  // Extract items from lines after the section header (until next ## heading or EOF)
  const items: string[] = [];
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) break; // next section
    const match = line.match(ITEM_RE);
    if (match) {
      items.push(match[1].trim());
    }
  }

  // Dedupe within same call
  const seen = new Set<string>();
  const observations: CapturedItem[] = [];
  let skipped = 0;

  for (const item of items) {
    const norm = item.toLowerCase().trim();
    if (seen.has(norm)) {
      skipped++;
      continue;
    }
    seen.add(norm);

    const title = item.length > 80 ? item.substring(0, 80) + '…' : item;

    const saved = await saveObservation(db, actor, {
      title,
      content: item,
      type: 'learning',
      project: input.project ?? null,
      scope: 'project',
      session_id: input.session_id ?? null,
    });

    if (saved.action === 'deduped') {
      skipped++;
    } else {
      observations.push({ id: saved.id, sync_id: saved.sync_id, title });
    }
  }

  return {
    saved: observations.length,
    skipped,
    observations,
  };
}
