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

export type { ObservationsTable };
