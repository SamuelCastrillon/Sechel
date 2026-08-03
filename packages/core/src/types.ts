import type { Generated, ColumnType } from 'kysely';

export interface SessionsTable {
  id: string;
  tenant_id: string;
  project: string;
  directory: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export interface ObservationsTable {
  id: Generated<number>;
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
  normalized_hash: string | null;
  revision_count: number;
  duplicate_count: number;
  last_seen_at: string | null;
  pinned: ColumnType<number, number | undefined, number>;
  created_at: ColumnType<string, string | undefined, string>;
  updated_at: ColumnType<string, string | undefined, string>;
  deleted_at: string | null;
  review_after: string | null;
}

export interface UserPromptsTable {
  id: Generated<number>;
  tenant_id: string;
  sync_id: string | null;
  session_id: string;
  content: string;
  project: string | null;
  created_at: string;
}

export interface MemoryRelationsTable {
  id: Generated<number>;
  tenant_id: string;
  sync_id: string | null;
  source_id: string;
  target_id: string;
  relation: string;
  judgment_status: string;
  reason: string | null;
  evidence: string | null;
  confidence: number | null;
  marked_by_actor: string | null;
  marked_by_kind: string | null;
  marked_by_model: string | null;
  session_id: string | null;
  created_at: ColumnType<string, string | undefined, string>;
  updated_at: ColumnType<string, string | undefined, string>;
}

export interface UserTokensTable {
  id: Generated<number>;
  tenant_id: string;
  user_id: number;
  prefix: string;
  token_hash: string;
  description: string | null;
  last_used_at: string | null;
  created_at: ColumnType<string, string | undefined, string>;
}

export interface InstanceSettingsTable {
  key: string;
  value: string;
  updated_at: ColumnType<string, string | undefined, string>;
}

export interface UsersTable {
  id: Generated<number>;
  tenant_id: string;
  username: string;
  role: string;
  credential_hash: string;
  is_active: ColumnType<number, number | undefined, number>;
  created_by: number | null;
  created_at: ColumnType<string, string | undefined, string>;
}

export interface ProjectsTable {
  id: Generated<number>;
  tenant_id: string;
  name: string;
  created_by: number | null;
  created_at: ColumnType<string, string | undefined, string>;
}

export interface UserProjectAccessTable {
  id: Generated<number>;
  tenant_id: string;
  user_id: number;
  project: string;
  permission: string;
  granted_by: number | null;
  created_at: ColumnType<string, string | undefined, string>;
}

export interface CortexDB {
  sessions: SessionsTable;
  observations: ObservationsTable;
  user_prompts: UserPromptsTable;
  memory_relations: MemoryRelationsTable;
  users: UsersTable;
  projects: ProjectsTable;
  user_project_access: UserProjectAccessTable;
  user_tokens: UserTokensTable;
  instance_settings: InstanceSettingsTable;
  _migrations: { version: string; applied_at: string };
}

export type ObservationRow = ObservationsTable;
export type UserRow = UsersTable;
