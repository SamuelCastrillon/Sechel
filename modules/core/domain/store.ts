import 'server-only';
import { sql, type Kysely } from 'kysely';
import { createHash, randomBytes } from 'node:crypto';
import type { CortexDB, ObservationsTable } from '../db/db-types';
import { getDb, TENANT_ID } from '../db';
import { assertAuthorized, type Actor } from '../auth';
import { OBS_COLS, type Candidate, type SaveResult, type SearchResultRow } from './types';
import { sanitizeFTS, sanitizeFTSCandidates } from './fts';
import { normalizeProject } from './normalize';
import { saveSchema, searchSchema, type SaveInput, type SearchInput } from './validation';

// ---------------------------------------------------------------------------
// Helpers (replicate upstream Engram behavior exactly for compatibility)
// ---------------------------------------------------------------------------

function stripPrivate(text: string): string {
  return text.replace(/<private>[\s\S]*?<\/private>/g, '');
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function genSyncId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

async function ensureSession(
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

// MCP tools resolve the app DB through this domain-level accessor instead of
// importing `@/modules/core/db` directly (keeps data access singular in
// core/domain per R2 — the db dependency lives here, not in modules/mcp).
export async function resolveDb(): Promise<Kysely<CortexDB>> {
  return getDb();
}

// ---------------------------------------------------------------------------
// Conflict surfacing (FindCandidates) — runs after a fresh insert
// ---------------------------------------------------------------------------

const BM25_FLOOR = -2.0; // default conflict floor

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
// mem_save -> AddObservation (doc §3.1)
// ---------------------------------------------------------------------------

export async function saveObservation(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: SaveInput,
): Promise<SaveResult> {
  await assertAuthorized(db, actor, input.project ?? null, 'write');

  const tenantId = TENANT_ID();
  const title = stripPrivate(input.title);
  const content = stripPrivate(input.content);
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
  // Fetch the new row id by sync_id (robust across Kysely/libSQL dialects;
  // lastInsertRowid is not reliably populated by kysely-libsql).
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

  // 4) Conflict surfacing
  const { judgment_required, candidates } = await findCandidates(
    db,
    tenantId,
    newId,
    syncId,
    project,
    scope,
    title,
    content,
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
// mem_search -> Search (doc §3.2)
// ---------------------------------------------------------------------------

export async function searchObservations(
  db: Kysely<CortexDB>,
  actor: Actor,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  await assertAuthorized(db, actor, input.project ?? null, 'read');

  const tenantId = TENANT_ID();
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

  // 2) FTS5 bm25 search (always merged)
  const ftsQuery =
    matchMode === 'any' ? sanitizeFTSCandidates(input.query) : sanitizeFTS(input.query);
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

  // Sort: direct (rank -1000) first, then by bm25 rank ascending (closer to 0 = better).
  order.sort((a, b) => a.rank - b.rank);
  return order.slice(0, limit).map((o) => merged.get(o.id)!);
}
