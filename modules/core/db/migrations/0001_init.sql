-- Sechel Slice 1 schema (authoritative, mirrors docs/engram-query-reference.md §2).
-- Idempotent: every object uses IF NOT EXISTS.
-- Applied by the migration runner (lib/migrations.ts / lib/db.ts).

CREATE TABLE IF NOT EXISTS _migrations (
  version    TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (version)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT NOT NULL,
  tenant_id  TEXT NOT NULL,
  project    TEXT NOT NULL,
  directory  TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at   TEXT,
  summary    TEXT,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS observations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       TEXT NOT NULL,
  sync_id         TEXT,
  session_id      TEXT NOT NULL,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  tool_name       TEXT,
  project         TEXT,
  scope           TEXT NOT NULL DEFAULT 'project',
  topic_key       TEXT,
  normalized_hash TEXT,
  revision_count  INTEGER NOT NULL DEFAULT 1,
  duplicate_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at    TEXT,
  pinned          BOOLEAN NOT NULL DEFAULT 0,
  review_after    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,
  FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_obs_tenant_session ON observations(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_obs_tenant_type    ON observations(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_obs_tenant_project ON observations(tenant_id, project);
CREATE INDEX IF NOT EXISTS idx_obs_tenant_created ON observations(tenant_id, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title, content, tool_name, type, project, topic_key,
  content='observations',
  content_rowid='id'
);

CREATE TABLE IF NOT EXISTS user_prompts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  sync_id    TEXT,
  session_id TEXT NOT NULL,
  content    TEXT NOT NULL,
  project    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  content, project,
  content='user_prompts',
  content_rowid='id'
);

CREATE TABLE IF NOT EXISTS memory_relations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       TEXT NOT NULL,
  sync_id         TEXT UNIQUE,
  source_id       TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  relation        TEXT NOT NULL,
  judgment_status TEXT NOT NULL DEFAULT 'pending',
  reason          TEXT,
  evidence        TEXT,
  confidence      REAL,
  marked_by_actor TEXT,
  marked_by_kind  TEXT,
  marked_by_model TEXT,
  session_id      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       TEXT NOT NULL,
  username        TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  credential_hash TEXT NOT NULL,
  created_by      INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, username)
);

CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS user_project_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  user_id    INTEGER NOT NULL,
  project    TEXT NOT NULL,
  permission TEXT NOT NULL,
  granted_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, user_id, project),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project, topic_key)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project, new.topic_key);
END;

CREATE TRIGGER IF NOT EXISTS obs_fts_delete AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project, topic_key)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project, old.topic_key);
END;

CREATE TRIGGER IF NOT EXISTS obs_fts_update AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project, topic_key)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project, old.topic_key);
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project, topic_key)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project, new.topic_key);
END;
