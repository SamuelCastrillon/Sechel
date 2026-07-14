import type { ObservationsTable } from '../types.js';

// Column list used by SELECT in searchObservations.
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

export type GetObservationResult = ObservationsTable | null;

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

export interface UpdateResult {
  id: number;
  sync_id: string;
  revision_count: number;
}

export interface DeleteResult {
  success: boolean;
}

export interface TimelineResult {
  focus: ObservationsTable | null;
  before: ObservationsTable[];
  after: ObservationsTable[];
}

export interface PromptRow {
  id: number;
  tenant_id: string;
  sync_id: string | null;
  session_id: string;
  content: string;
  project: string | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  tenant_id: string;
  project: string;
  directory: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export interface ContextResult {
  sessions: SessionRow[];
  pinned: ObservationsTable[];
  recent: ObservationsTable[];
  prompts: PromptRow[];
  count: number;
}

export interface JudgeResult {
  success: boolean;
}

export interface CompareResult {
  sync_id: string;
}

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
