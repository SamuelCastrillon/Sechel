import { sql, type Kysely } from 'kysely';
import { createHash, randomBytes } from 'node:crypto';
import type { CortexDB, ObservationsTable, ObservationRow } from '../types.js';
import type { Actor } from '../auth.js';
import { assertAuthorized } from '../auth.js';
import { normalizeProject, stripPrivateTags } from './normalize.js';
import { OBS_COLS, type Candidate, type SaveResult, type SearchResultRow } from './types.js';
import { sanitizeFTS, sanitizeFTSCandidates } from './fts.js';
import {
  saveSchema,
  searchSchema,
  getObservationSchema,
  statsSchema,
  currentProjectSchema,
  suggestTopicKeySchema,
  pinSchema,
  savePromptSchema,
  updateSchema,
  deleteSchema,
  type SaveInput,
  type SearchInput,
  type GetObservationInput,
  type StatsInput,
  type CurrentProjectInput,
  type SuggestTopicKeyInput,
  type PinInput,
  type SavePromptInput,
  type UpdateInput,
  type DeleteInput,
} from './validation.js';
import {
  type StatsResult,
  type CurrentProjectResult,
  type SuggestTopicKeyResult,
  type SavePromptResult,
  type UpdateResult,
  type DeleteResult,
} from './types.js';
import { ensureSession } from './store-session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function genSyncId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

async function getObservationById(
  db: Kysely<CortexDB>,
  tenantId: string,
  id: number,
): Promise<ObservationsTable | null> {
  const r = await sql<ObservationsTable>`
    SELECT * FROM observations WHERE tenant_id = ${tenantId} AND id = ${id}
  `.execute(db);
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Conflict surfacing (FindCandidates)
// ---------------------------------------------------------------------------

const BM25_FLOOR = -2.0;

async function findCandidates(
  db: Kysely<CortexDB>,
  tenantId: string,
  savedId: number,
  savedSyncId: string,
  project: string | null,
  scope: string,
  title: string,
  content: string,
): Promise<{ judgment_required: boolean; candidates: Candidate[] }> {
  const ftsQuery = sanitizeFTS(`${title} ${content}`);
  const r = await sql<{
    id: number;
    sync_id: string;
    title: string;
    type: string;
    topic_key: string | null;
    rank: number;
  }>`
    SELECT o.id, ifnull(o.sync_id, '') AS sync_id, o.title, o.type, o.topic_key, fts.rank
    FROM observations_fts fts
    JOIN observations o ON o.id = fts.rowid
    WHERE observations_fts MATCH ${ftsQuery}
      AND o.tenant_id = ${tenantId}
      AND o.id != ${savedId}
      AND o.deleted_at IS NULL
      AND ifnull(o.project, '') = ifnull(${project}, '')
      AND o.scope = ${scope}
    ORDER BY fts.rank
    LIMIT 9
  `.execute(db);

  const candidates: Candidate[] = [];
  const seen = new Set<number>();
  for (const row of r.rows) {
    if (row.rank < BM25_FLOOR) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    candidates.push({
      id: row.id,
      sync_id: row.sync_id,
      title: row.title,
      type: row.type,
      topic_key: row.topic_key,
      score: row.rank,
    });
  }

  if (candidates.length === 0) {
    return { judgment_required: false, candidates: [] };
  }

  for (const c of candidates) {
    const relSync = genSyncId('rel');
    await sql`
      INSERT INTO memory_relations
        (tenant_id, sync_id, source_id, target_id, relation, judgment_status, session_id)
      VALUES (${tenantId}, ${relSync}, ${savedSyncId}, ${c.sync_id}, 'pending', 'pending', ${String(savedId)})
    `.execute(db);
    c.judgment_id = relSync;
  }

  return { judgment_required: true, candidates };
}

// ---------------------------------------------------------------------------
// mem_save — saveObservation
// ---------------------------------------------------------------------------

export async function saveObservation(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: SaveInput,
): Promise<SaveResult> {
  await assertAuthorized(db, tenantId, actor, input.project ?? null, 'write');

  const title = stripPrivateTags(input.title);
  const content = stripPrivateTags(input.content);
  const type = input.type ?? 'manual';
  const scope = input.scope ?? 'project';
  const project = normalizeProject(input.project);
  const topicKey = input.topic_key ?? null;
  const toolName = input.tool_name ?? null;
  const normHash = hashContent(content);

  const sessionId = await ensureSession(db, tenantId, input.session_id ?? null, project);

  // 1) Topic-key upsert lookup
  let existingId: number | null = null;
  let action: SaveResult['action'] = 'inserted';

  if (topicKey) {
    const r = await sql<{ id: number }>`
      SELECT id FROM observations
      WHERE tenant_id = ${tenantId}
        AND topic_key = ${topicKey}
        AND ifnull(project, '') = ifnull(${project}, '')
        AND scope = ${scope}
        AND deleted_at IS NULL
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
      LIMIT 1
    `.execute(db);
    if (r.rows[0]) existingId = r.rows[0].id;
  }

  if (existingId !== null) {
    await sql`
      UPDATE observations
      SET type = ${type}, title = ${title}, content = ${content}, tool_name = ${toolName},
          topic_key = ${topicKey}, normalized_hash = ${normHash},
          revision_count = revision_count + 1,
          last_seen_at = datetime('now'), updated_at = datetime('now')
      WHERE tenant_id = ${tenantId} AND id = ${existingId}
    `.execute(db);
    const row = await getObservationById(db, tenantId, existingId);
    return {
      id: existingId,
      sync_id: row?.sync_id ?? '',
      action: 'updated',
      revision_count: row?.revision_count ?? 0,
      duplicate_count: row?.duplicate_count ?? 0,
      judgment_required: false,
      candidates: [],
    };
  }

  // 2) Dedupe window (only when no topic_key)
  if (!topicKey) {
    const r = await sql<{ id: number }>`
      SELECT id FROM observations
      WHERE tenant_id = ${tenantId}
        AND normalized_hash = ${normHash}
        AND ifnull(project, '') = ifnull(${project}, '')
        AND scope = ${scope}
        AND type = ${type}
        AND title = ${title}
        AND deleted_at IS NULL
        AND datetime(created_at) >= datetime('now', '-15 minutes')
      ORDER BY created_at DESC
      LIMIT 1
    `.execute(db);
    if (r.rows[0]) existingId = r.rows[0].id;
  }

  if (existingId !== null) {
    await sql`
      UPDATE observations
      SET duplicate_count = duplicate_count + 1,
          last_seen_at = datetime('now'), updated_at = datetime('now')
      WHERE tenant_id = ${tenantId} AND id = ${existingId}
    `.execute(db);
    const row = await getObservationById(db, tenantId, existingId);
    return {
      id: existingId,
      sync_id: row?.sync_id ?? '',
      action: 'deduped',
      revision_count: row?.revision_count ?? 0,
      duplicate_count: row?.duplicate_count ?? 0,
      judgment_required: false,
      candidates: [],
    };
  }

  // 3) Fresh insert
  const syncId = input.sync_id ?? genSyncId('obs');
  await sql`
    INSERT INTO observations
      (tenant_id, sync_id, session_id, type, title, content, tool_name,
       project, scope, topic_key, normalized_hash, revision_count, duplicate_count,
       last_seen_at, updated_at)
    VALUES
      (${tenantId}, ${syncId}, ${sessionId}, ${type}, ${title}, ${content}, ${toolName},
       ${project}, ${scope}, ${topicKey}, ${normHash}, 1, 1, datetime('now'), datetime('now'))
  `.execute(db);
  const idRow = await sql<{ id: number }>`
    SELECT id FROM observations WHERE tenant_id = ${tenantId} AND sync_id = ${syncId}
  `.execute(db);
  const newId = idRow.rows[0].id;

  if (input.review_after) {
    await sql`
      UPDATE observations SET review_after = ${input.review_after}
      WHERE tenant_id = ${tenantId} AND id = ${newId}
    `.execute(db);
  }

  const { judgment_required, candidates } = await findCandidates(
    db, tenantId, newId, syncId, project, scope, title, content,
  );

  return {
    id: newId,
    sync_id: syncId,
    action: 'inserted',
    revision_count: 1,
    duplicate_count: 1,
    judgment_required,
    candidates,
  };
}

// ---------------------------------------------------------------------------
// mem_search — searchObservations
// ---------------------------------------------------------------------------

export async function searchObservations(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  await assertAuthorized(db, tenantId, actor, input.project ?? null, 'read');

  const project = normalizeProject(input.project);
  const scope = input.scope ?? 'project';
  const limit = input.limit ?? 10;
  const matchMode = input.match_mode ?? 'all';

  const merged = new Map<number, SearchResultRow>();
  const order: { id: number; rank: number }[] = [];

  // 1) Direct topic_key match when query contains '/'
  if (input.query.includes('/')) {
    const direct = await sql<SearchResultRow>`
      SELECT ${sql.raw(OBS_COLS)} FROM observations o
      WHERE o.tenant_id = ${tenantId} AND o.topic_key = ${input.query} AND o.deleted_at IS NULL
        ${input.type ? sql`AND o.type = ${input.type}` : sql``}
        ${project ? sql`AND LOWER(o.project) = ${project}` : sql``}
        ${scope ? sql`AND o.scope = ${scope}` : sql``}
      ORDER BY o.updated_at DESC
      LIMIT ${limit}
    `.execute(db);
    for (const row of direct.rows) {
      const pinned: SearchResultRow = { ...row, rank: -1000 };
      merged.set(pinned.id, pinned);
      order.push({ id: pinned.id, rank: -1000 });
    }
  }

  // 2) FTS5 bm25 search
  const ftsQuery = matchMode === 'any' ? sanitizeFTSCandidates(input.query) : sanitizeFTS(input.query);
  const fts = await sql<SearchResultRow & { rank: number }>`
    SELECT ${sql.raw(OBS_COLS)}, fts.rank FROM observations_fts fts
    JOIN observations o ON o.id = fts.rowid
    WHERE observations_fts MATCH ${ftsQuery}
      AND o.tenant_id = ${tenantId}
      AND o.deleted_at IS NULL
      ${input.type ? sql`AND o.type = ${input.type}` : sql``}
      ${project ? sql`AND LOWER(o.project) = ${project}` : sql``}
      ${scope ? sql`AND o.scope = ${scope}` : sql``}
    ORDER BY fts.rank
    LIMIT ${limit}
  `.execute(db);

  for (const row of fts.rows) {
    if (merged.has(row.id)) continue;
    merged.set(row.id, row);
    order.push({ id: row.id, rank: row.rank });
  }

  order.sort((a, b) => a.rank - b.rank);
  return order.slice(0, limit).map((o) => merged.get(o.id)!);
}

// ---------------------------------------------------------------------------
// P1 — Simple reads
// ---------------------------------------------------------------------------

export async function getObservation(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: GetObservationInput,
): Promise<ObservationRow | null> {
  await assertAuthorized(db, tenantId, actor, null, 'read');

  const r = await sql<ObservationRow>`
    SELECT * FROM observations
    WHERE tenant_id = ${tenantId} AND id = ${input.id} AND deleted_at IS NULL
  `.execute(db);
  return r.rows[0] ?? null;
}

export async function getStats(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
): Promise<StatsResult> {
  await assertAuthorized(db, tenantId, actor, null, 'read');

  const [sessions, observations, prompts, projects] = await Promise.all([
    sql<{ c: number }>`SELECT COUNT(*) AS c FROM sessions WHERE tenant_id = ${tenantId}`.execute(db),
    sql<{ c: number }>`SELECT COUNT(*) AS c FROM observations WHERE tenant_id = ${tenantId} AND deleted_at IS NULL`.execute(db),
    sql<{ c: number }>`SELECT COUNT(*) AS c FROM user_prompts WHERE tenant_id = ${tenantId}`.execute(db),
    sql<{ project: string }>`
      SELECT project FROM observations
      WHERE tenant_id = ${tenantId} AND project IS NOT NULL AND deleted_at IS NULL
      GROUP BY project ORDER BY MAX(created_at) DESC
    `.execute(db),
  ]);

  return {
    sessions: Number(sessions.rows[0].c),
    observations: Number(observations.rows[0].c),
    prompts: Number(prompts.rows[0].c),
    projects: projects.rows.map((r) => r.project),
  };
}

export async function getCurrentProject(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: CurrentProjectInput,
): Promise<CurrentProjectResult> {
  await assertAuthorized(db, tenantId, actor, null, 'read');

  const projRows = await sql<{ project: string }>`
    SELECT project FROM observations
    WHERE tenant_id = ${tenantId} AND project IS NOT NULL AND deleted_at IS NULL
    GROUP BY project ORDER BY MAX(created_at) DESC
  `.execute(db);
  const availableProjects = projRows.rows.map((r) => r.project);

  if (input.project) {
    return {
      project: input.project,
      project_source: 'explicit',
      project_path: '',
      cwd: '',
      available_projects: availableProjects,
    };
  }

  const recent = await sql<{ project: string }>`
    SELECT project FROM observations
    WHERE tenant_id = ${tenantId} AND project IS NOT NULL AND deleted_at IS NULL
    GROUP BY project ORDER BY MAX(created_at) DESC LIMIT 1
  `.execute(db);

  if (recent.rows[0]) {
    return {
      project: recent.rows[0].project,
      project_source: 'recent_activity',
      project_path: '',
      cwd: '',
      available_projects: availableProjects,
    };
  }

  return {
    project: null,
    project_source: 'none',
    project_path: '',
    cwd: '',
    available_projects: availableProjects,
  };
}

export function suggestTopicKey(input: SuggestTopicKeyInput): SuggestTopicKeyResult {
  const typePrefixes: Record<string, string> = {
    architecture: 'architecture',
    bugfix: 'bug',
    decision: 'decision',
    pattern: 'pattern',
    config: 'config',
    discovery: 'discovery',
    learning: 'learning',
    manual: 'manual',
  };

  const prefix = typePrefixes[input.type ?? 'manual'] ?? 'manual';
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return { topic_key: `${prefix}/${slug}` };
}

// ---------------------------------------------------------------------------
// P2 — Simple writes
// ---------------------------------------------------------------------------

export async function pinObservation(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: PinInput,
): Promise<{ success: boolean }> {
  const obs = await getObservationById(db, tenantId, input.id);
  if (!obs) throw new Error('Observation not found');

  await assertAuthorized(db, tenantId, actor, obs.project, 'write');

  const r = await sql`
    UPDATE observations SET pinned = 1, updated_at = datetime('now')
    WHERE tenant_id = ${tenantId} AND id = ${input.id} AND deleted_at IS NULL
  `.execute(db);

  if (r.numAffectedRows !== undefined && Number(r.numAffectedRows) === 0) {
    throw new Error('Observation not found');
  }

  return { success: true };
}

export async function unpinObservation(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: PinInput,
): Promise<{ success: boolean }> {
  const obs = await getObservationById(db, tenantId, input.id);
  if (!obs) throw new Error('Observation not found');

  await assertAuthorized(db, tenantId, actor, obs.project, 'write');

  const r = await sql`
    UPDATE observations SET pinned = 0, updated_at = datetime('now')
    WHERE tenant_id = ${tenantId} AND id = ${input.id} AND deleted_at IS NULL
  `.execute(db);

  if (r.numAffectedRows !== undefined && Number(r.numAffectedRows) === 0) {
    throw new Error('Observation not found');
  }

  return { success: true };
}

export async function savePrompt(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: SavePromptInput,
): Promise<SavePromptResult> {
  await assertAuthorized(db, tenantId, actor, input.project ?? null, 'write');

  const project = normalizeProject(input.project);
  const syncId = input.sync_id ?? genSyncId('prompt');

  await sql`
    INSERT INTO user_prompts (tenant_id, sync_id, session_id, content, project)
    VALUES (${tenantId}, ${syncId}, ${input.session_id}, ${input.content}, ${project})
  `.execute(db);

  const idRow = await sql<{ id: number }>`
    SELECT id FROM user_prompts WHERE tenant_id = ${tenantId} AND sync_id = ${syncId}
  `.execute(db);
  const newId = idRow.rows[0].id;

  return { id: newId, sync_id: syncId };
}

// ---------------------------------------------------------------------------
// P3 — Medium writes
// ---------------------------------------------------------------------------

export async function updateObservation(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: UpdateInput,
): Promise<UpdateResult> {
  const obs = await getObservationById(db, tenantId, input.id);
  if (!obs) throw new Error('Observation not found');
  if (obs.deleted_at !== null) throw new Error('Observation not found');

  await assertAuthorized(db, tenantId, actor, obs.project, 'write');

  const title = input.title !== undefined ? stripPrivateTags(input.title) : undefined;
  const content = input.content !== undefined ? stripPrivateTags(input.content) : undefined;
  const normHash = content !== undefined ? hashContent(content) : undefined;

  const setClauses: any[] = [];

  if (title !== undefined) setClauses.push(sql`title = ${title}`);
  if (content !== undefined) setClauses.push(sql`content = ${content}`);
  if (input.type !== undefined) setClauses.push(sql`type = ${input.type}`);
  if (input.project !== undefined) setClauses.push(sql`project = ${normalizeProject(input.project)}`);
  if (input.scope !== undefined) setClauses.push(sql`scope = ${input.scope}`);
  if (input.topic_key !== undefined) setClauses.push(sql`topic_key = ${input.topic_key ?? null}`);
  if (input.tool_name !== undefined) setClauses.push(sql`tool_name = ${input.tool_name ?? null}`);
  if (input.session_id !== undefined) setClauses.push(sql`session_id = ${input.session_id ?? null}`);
  if (input.sync_id !== undefined) setClauses.push(sql`sync_id = ${input.sync_id ?? null}`);
  if (input.pinned !== undefined) setClauses.push(sql`pinned = ${input.pinned ? 1 : 0}`);
  if (input.review_after !== undefined) setClauses.push(sql`review_after = ${input.review_after ?? null}`);
  if (normHash !== undefined) setClauses.push(sql`normalized_hash = ${normHash}`);

  setClauses.push(sql`revision_count = revision_count + 1`);
  setClauses.push(sql`updated_at = datetime('now')`);

  await sql`
    UPDATE observations
    SET ${sql.join(setClauses, sql`, `)}
    WHERE tenant_id = ${tenantId} AND id = ${input.id} AND deleted_at IS NULL
  `.execute(db);

  const updated = await getObservationById(db, tenantId, input.id);

  return {
    id: Number(updated!.id),
    sync_id: updated!.sync_id ?? '',
    revision_count: Number(updated!.revision_count),
  };
}

export async function deleteObservation(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: DeleteInput,
): Promise<DeleteResult> {
  const obs = await getObservationById(db, tenantId, input.id);
  if (!obs) throw new Error('Observation not found');
  if (obs.deleted_at !== null) throw new Error('Observation not found');

  const syncId = obs.sync_id;
  await assertAuthorized(db, tenantId, actor, obs.project, 'write');

  if (input.hard_delete) {
    await db.transaction().execute(async (trx) => {
      await sql`
        DELETE FROM observations WHERE tenant_id = ${tenantId} AND id = ${input.id}
      `.execute(trx);
      await sql`
        UPDATE memory_relations
        SET judgment_status = 'orphaned', updated_at = datetime('now')
        WHERE tenant_id = ${tenantId} AND (source_id = ${syncId} OR target_id = ${syncId})
      `.execute(trx);
    });
  } else {
    await sql`
      UPDATE observations SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE tenant_id = ${tenantId} AND id = ${input.id} AND deleted_at IS NULL
    `.execute(db);
  }

  return { success: true };
}
