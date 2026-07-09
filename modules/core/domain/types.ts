import type { ObservationsTable } from '../db/db-types';

// Column list used by SELECT in searchObservations. Kept as a const (value, not
// just types) so the SQL projection stays in sync with the row mapping. NOTE: it
// now includes `review_after` to match the ObservationsTable drift fix.
export const OBS_COLS = `o.id, o.tenant_id, o.sync_id, o.session_id, o.type, o.title,
  o.content, o.tool_name, o.project, o.scope, o.topic_key, o.revision_count,
  o.duplicate_count, o.last_seen_at, o.pinned, o.review_after, o.created_at, o.updated_at`;

export interface Candidate {
  id: number;
  sync_id: string;
  title: string;
  type: string;
  topic_key: string | null;
  score: number;
  judgment_id?: string;
}

export interface SaveResult {
  id: number;
  sync_id: string;
  action: 'inserted' | 'updated' | 'deduped';
  revision_count: number;
  duplicate_count: number;
  judgment_required: boolean;
  candidates: Candidate[];
}

// ---------------------------------------------------------------------------
// P1 — Lectura simple result types
// ---------------------------------------------------------------------------

export type GetObservationResult = import('../db/db-types').ObservationsTable | null;

export interface StatsResult {
  sessions: number;
  observations: number;
  prompts: number;
  projects: string[];
}

export interface CurrentProjectResult {
  project: string | null;
  project_source: string;
  project_path: string;
  cwd: string;
  available_projects: string[];
}

export interface SuggestTopicKeyResult {
  topic_key: string;
}

// ---------------------------------------------------------------------------
// P2 — Escritura simple result types
// ---------------------------------------------------------------------------

export interface PinResult {
  success: boolean;
}

export interface SavePromptResult {
  id: number;
  sync_id: string;
}

export interface SessionStartResult {
  id: string;
}

export interface SessionEndResult {
  success: boolean;
}

export interface SearchResultRow {
  id: number;
  tenant_id: string;
  sync_id: string | null;
  session_id: string;
  type: string;
  title: string;
  content: string;
  tool_name: string | null;
  project: string | null;
  scope: string;
  topic_key: string | null;
  revision_count: number;
  duplicate_count: number;
  last_seen_at: string | null;
  pinned: number;
  review_after: string | null;
  created_at: string;
  updated_at: string;
  rank: number;
}

// ---------------------------------------------------------------------------
// P5 — Juicio result types
// ---------------------------------------------------------------------------

export interface JudgeResult {
  success: boolean;
}

export interface CompareResult {
  sync_id: string;
}

// ---------------------------------------------------------------------------
// P6 — Administrativos result types
// ---------------------------------------------------------------------------

export interface DoctorResult {
  observations: number;
  sessions: number;
  user_prompts: number;
  memory_relations: number;
  conflict_candidates: number;
  orphaned_relations: number;
  newest_observation: string | null;
  surface_issues: string[];
}

export interface MergeProjectsResult {
  success: boolean;
}

export interface CapturedItem {
  id: number;
  sync_id: string;
  title: string;
}

export interface CapturePassiveResult {
  saved: number;
  skipped: number;
  observations: CapturedItem[];
}

export type { ObservationsTable };
