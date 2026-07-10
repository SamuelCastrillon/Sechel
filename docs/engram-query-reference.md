# Engram Query Reference — CortextMCP Cloud (single-org, project-scoped)

> Portions of this document are derived from Engram's internal store layer.
> © 2026 Alan Buscaglia — MIT License
> https://github.com/Gentleman-Programming/engram

This document is the authoritative reference for the SQL behavior of the 20 `mem_*`
MCP tools exposed by the CortextMCP cloud server. It is derived from the upstream
Engram `internal/store/store.go` and `internal/store/relations.go` so tool behavior
stays 100% compatible for any MCP-HTTP agent.

> **Structural model (read this first).** CortextMCP is an **open-source, self-hosted**
> tool. Each deployment serves **one organization/team/person** — there is no
> multi-company tenancy inside a single database. Isolation between organizations is
> achieved by **separate deployments**, not by schema. Within one instance:
> - `tenant_id` is a **single constant org id per instance** (injected from instance
>   config, never from a multi-company auth token). It scopes data so a bug cannot
>   cross instance boundaries.
> - The real access boundary is **per-project authorization**: memories belong to
>   **projects**, and a `user_project_access` grant decides which users may
>   read/write a given project. See §1 and §3 (Authorization guard).
>
> **Storage backend:** Turso / libSQL (SQLite-compatible). FTS5 is supported by
> Turso, so the `observations_fts` virtual table and `bm25()` ranking work
> unchanged. Every statement below is valid libSQL.

---

## 1. Deployment & tenancy model

Upstream Engram is single-user with a local SQLite file. CortextMCP is a shared
server for a **team**, so data is organized differently:

- **One instance = one org.** The `tenant_id` column is a constant org identifier for
  the whole deployment (set from env/config). It is NOT a per-company partition key.
- **Projects, not users, own memories.** `observations.project` groups memories.
  Multiple users can read/write the same project.
- **Users & roles.** `users` holds accounts with role `admin` or `member`. A bearer
  token resolves to a `user_id`.
- **Per-project authorization.** `user_project_access` grants a user a permission
  (`read` / `write` / `admin`) on a project. `admin` role implies all projects.

| Upstream table             | CortextMCP change                                       |
| -------------------------- | ------------------------------------------------------- |
| `sessions`                 | + `tenant_id TEXT NOT NULL` (constant per instance)     |
| `observations`             | + `tenant_id TEXT NOT NULL` (constant per instance)     |
| `user_prompts`             | + `tenant_id TEXT NOT NULL` (constant per instance)     |
| `memory_relations`         | + `tenant_id TEXT NOT NULL` (constant per instance)     |
| `users` (NEW)              | accounts + role (`admin`/`member`)                      |
| `projects` (NEW)           | project registry (name, created_by)                     |
| `user_project_access` (NEW)| user ↔ project ↔ permission (`read`/`write`/`admin`)   |
| `sync_mutations`           | **DROPPED** — no local→cloud replication in cloud       |
| `sync_chunks`              | **DROPPED** — same reason                               |

Notes:
- `observations.id` remains `INTEGER AUTOINCREMENT`. `tenant_id` is constant, so it is
  effectively a partition of one. Agents receive `id` as before.
- `sync_id` (`obs-<hex>`, `prompt-<hex>`, `rel-<hex>`) is preserved as the stable
  external identity. It is used for idempotent upserts and for the conflict
  surfacing layer.
- Migration from a local Engram instance is **not** a bulk import. Users keep Engram
  configured alongside CortextMCP and ask their agent to copy selected memories via
  `mem_save` (same `topic_key`/`type`). The cloud server needs no special import
  endpoint.

---

## 2. Schema (cloud-adapted)

```sql
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
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id      TEXT NOT NULL,
  sync_id        TEXT,
  session_id     TEXT NOT NULL,
  type           TEXT NOT NULL,
  title          TEXT NOT NULL,
  content        TEXT NOT NULL,
  tool_name      TEXT,
  project        TEXT,
  scope          TEXT NOT NULL DEFAULT 'project',
  topic_key      TEXT,
  normalized_hash TEXT,
  revision_count INTEGER NOT NULL DEFAULT 1,
  duplicate_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at   TEXT,
  pinned         BOOLEAN NOT NULL DEFAULT 0,
  review_after   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT,
  FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_obs_tenant_session ON observations(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_obs_tenant_type    ON observations(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_obs_tenant_project ON observations(tenant_id, project);
CREATE INDEX IF NOT EXISTS idx_obs_tenant_created ON observations(tenant_id, created_at DESC);

-- FTS5 over the same columns as upstream. content='observations' keeps it
-- managed by the triggers below.
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
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        TEXT NOT NULL,
  sync_id          TEXT UNIQUE,
  source_id        TEXT NOT NULL,
  target_id        TEXT NOT NULL,
  relation         TEXT NOT NULL,
  judgment_status  TEXT NOT NULL DEFAULT 'pending',  -- pending|judged|orphaned|ignored
  reason           TEXT,
  evidence         TEXT,
  confidence       REAL,
  marked_by_actor  TEXT,
  marked_by_kind   TEXT,
  marked_by_model  TEXT,
  session_id       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accounts. One instance = one org; roles: admin | member.
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       TEXT NOT NULL,
  username        TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',   -- admin | member
  credential_hash TEXT NOT NULL,
  created_by      INTEGER,                           -- user_id who created this account
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, username)
);

-- Project registry (admin-facing listing / grant target).
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, name)
);

-- Per-project authorization. `project` matches observations.project (text).
CREATE TABLE IF NOT EXISTS user_project_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,
  user_id    INTEGER NOT NULL,
  project    TEXT NOT NULL,
  permission TEXT NOT NULL,   -- read | write | admin
  granted_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, user_id, project),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### FTS5 sync triggers (identical to upstream)

```sql
CREATE TRIGGER obs_fts_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project, topic_key)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project, new.topic_key);
END;

CREATE TRIGGER obs_fts_delete AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project, topic_key)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project, old.topic_key);
END;

CREATE TRIGGER obs_fts_update AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project, topic_key)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project, old.topic_key);
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project, topic_key)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project, new.topic_key);
END;
```

> Triggers operate per-row. In libSQL/stateless execution, run the `INSERT`/`UPDATE`/
> `DELETE` and the trigger fires server-side in the same statement batch. No extra
> client work needed.

---

## 3. Tool → query mapping

All snippets assume a bound parameter `:tenant_id` = the **constant instance org id**
(injected from config, not from a user token). The `nullableString()` helper maps Go
`""` → SQL `NULL`.

### Authorization guard (applies to every tool)

Before any read/write, the server resolves the caller from the bearer token to a
`user_id` + `role`. Then:

- `admin` role → access to **all** projects (no `user_project_access` row required).
- `member` role → the target `project` must have a `user_project_access` row for the
  `user_id` with the required level: `read` for `search`/`get`/`context`/`timeline`/
  `stats`; `write` (or `admin`) for `save`/`update`/`delete`/`judge`.
- A defensive SQL check can be added, e.g. for a read on project `:project`:
  ```sql
  AND EXISTS (
    SELECT 1 FROM user_project_access upa
    WHERE upa.tenant_id = :tenant_id AND upa.user_id = :user_id
      AND upa.project = :project AND upa.permission IN ('read','write','admin')
  )
  ```
  The app guard is the authoritative check; the SQL `EXISTS` is defense-in-depth.

The per-project filter below is shown as `AND o.project = :project` /
`LOWER(project) = :project`; the guard guarantees the caller is authorized for that
project before the statement runs.

### 3.1 `mem_save` → `AddObservation`

Behavior (must match upstream exactly for compatibility):
1. Strip `<private>…</private>` tags from title/content.
2. Normalize project (lowercase + trim) and scope.
3. Compute `normalized_hash` of content.
4. **Topic-key upsert:** if `topic_key` provided, find the latest non-deleted row
   with same `tenant_id + topic_key + project + scope`; if found, `UPDATE`
   (bump `revision_count`), else `INSERT`.
5. **Dedupe window:** if no topic_key, find a row with same `normalized_hash +
   project + scope + type + title` created within the dedupe window (15 min);
   if found, bump `duplicate_count`, else `INSERT`.
6. **Conflict surfacing:** after insert, run `FindCandidates` (§3.9); if any
   candidate passes the BM25 floor, insert a pending `memory_relations` row and
   return `judgment_required: true` + `candidates[]` to the agent.

```sql
-- Topic-key upsert lookup
SELECT id FROM observations
WHERE tenant_id = :tenant_id
  AND topic_key = :topic_key
  AND ifnull(project, '') = ifnull(:project, '')
  AND scope = :scope
  AND deleted_at IS NULL
ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
LIMIT 1;

-- Topic-key upsert UPDATE
UPDATE observations
SET type = :type, title = :title, content = :content, tool_name = :tool_name,
    topic_key = :topic_key, normalized_hash = :norm_hash,
    revision_count = revision_count + 1,
    last_seen_at = datetime('now'), updated_at = datetime('now')
WHERE tenant_id = :tenant_id AND id = :existing_id;

-- Dedupe window lookup (no topic_key)
SELECT id FROM observations
WHERE tenant_id = :tenant_id
  AND normalized_hash = :norm_hash
  AND ifnull(project, '') = ifnull(:project, '')
  AND scope = :scope
  AND type = :type
  AND title = :title
  AND deleted_at IS NULL
  AND datetime(created_at) >= datetime('now', :dedupe_window)   -- e.g. '-15 minutes'
ORDER BY created_at DESC
LIMIT 1;

-- Dedupe bump
UPDATE observations
SET duplicate_count = duplicate_count + 1,
    last_seen_at = datetime('now'), updated_at = datetime('now')
WHERE tenant_id = :tenant_id AND id = :existing_id;

-- Fresh INSERT
INSERT INTO observations
  (tenant_id, sync_id, session_id, type, title, content, tool_name,
   project, scope, topic_key, normalized_hash, revision_count, duplicate_count,
   last_seen_at, updated_at)
VALUES
  (:tenant_id, :sync_id, :session_id, :type, :title, :content, :tool_name,
   :project, :scope, :topic_key, :norm_hash, 1, 1, datetime('now'), datetime('now'));

-- review_after for decay types (NEW inserts only)
UPDATE observations SET review_after = :review_after WHERE tenant_id = :tenant_id AND id = :new_id;
```

`dedupe_window` expression: `'-' || CAST(strftime('%s', :window_duration) AS TEXT)` is
not portable; upstream uses `datetime('now', '-15 minutes')`. Use the literal
negative interval string computed in the application layer.

---

### 3.2 `mem_search` → `Search`

1. If query contains `/`, first try a direct `topic_key` equality match (rank
   pinned to `-1000` so it sorts first).
2. Otherwise (and always, merged) run FTS5 `MATCH` with sanitized query.
3. `match_mode`:
   - `all` (default): `sanitizeFTS` → wraps every word in double quotes
     (`"jwt" "auth"`), AND semantics.
   - `any`: `sanitizeFTSCandidates` → OR semantics (same wrapping, joined by space
     is AND in FTS5; upstream joins candidates with space too — verify against
     `sanitizeFTSCandidates` if broader recall is needed).
4. Order by `fts.rank` (BM25, negative; closer to 0 = better).
5. Dedupe direct + FTS results by `id`.

```sql
-- Direct topic_key match (if query has '/')
SELECT <cols> FROM observations
WHERE tenant_id = :tenant_id AND topic_key = :query AND deleted_at IS NULL
  [AND type = :type] [AND LOWER(project) = :project] [AND scope = :scope]
ORDER BY updated_at DESC LIMIT :limit;

-- FTS5 search
SELECT o.<cols>, fts.rank
FROM observations_fts fts
JOIN observations o ON o.id = fts.rowid
WHERE observations_fts MATCH :fts_query
  AND o.tenant_id = :tenant_id
  AND o.deleted_at IS NULL
  [AND o.type = :type]
  [AND LOWER(o.project) = :project]
  [AND o.scope = :scope]
ORDER BY fts.rank
LIMIT :limit;
```

`sanitizeFTS` (upstream, verbatim):
```go
func sanitizeFTS(query string) string {
  words := strings.Fields(query)
  for i, w := range words {
    w = strings.Trim(w, `"`)
    words[i] = `"` + w + `"`
  }
  return strings.Join(words, " ")
}
```
Replicate this exactly so ranking matches upstream.

---

### 3.3 `mem_get_observation` → `GetObservation`

```sql
SELECT <cols> FROM observations
WHERE tenant_id = :tenant_id AND id = :id AND deleted_at IS NULL;
```

---

### 3.4 `mem_update` → `UpdateObservation`

Partial update; only supplied fields change. Bumps `revision_count` and
`normalized_hash` (from new content). Re-strips `<private>` tags.

```sql
UPDATE observations
SET type = :type, title = :title, content = :content,
    project = :project, scope = :scope, topic_key = :topic_key,
    normalized_hash = :norm_hash,
    revision_count = revision_count + 1,
    updated_at = datetime('now')
WHERE tenant_id = :tenant_id AND id = :id AND deleted_at IS NULL;
```

---

### 3.5 `mem_delete` → `DeleteObservation`

- **Soft delete** (default): set `deleted_at`.
- **Hard delete** (`hard_delete=true`): `DELETE` row + orphan any
  `memory_relations` referencing its `sync_id` (set `judgment_status='orphaned'`).

```sql
-- Soft
UPDATE observations
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE tenant_id = :tenant_id AND id = :id AND deleted_at IS NULL;

-- Hard
DELETE FROM observations WHERE tenant_id = :tenant_id AND id = :id;

UPDATE memory_relations
SET judgment_status = 'orphaned', updated_at = datetime('now')
WHERE tenant_id = :tenant_id AND (source_id = :sync_id OR target_id = :sync_id);
```

---

### 3.6 `mem_timeline` → `Timeline`

Chronological neighborhood within the SAME session as the focus observation.
Returns `before` (older) + `after` (newer) entries, plus the focus.

```sql
-- focus
SELECT <cols> FROM observations
WHERE tenant_id = :tenant_id AND id = :focus_id AND deleted_at IS NULL;

-- before (older, same session)
SELECT id, session_id, type, title, content, tool_name, project, scope, topic_key,
       revision_count, duplicate_count, last_seen_at, created_at, updated_at, deleted_at
FROM observations
WHERE tenant_id = :tenant_id AND session_id = :session_id AND id < :focus_id AND deleted_at IS NULL
ORDER BY id DESC LIMIT :before;

-- after (newer, same session)
SELECT <same cols>
FROM observations
WHERE tenant_id = :tenant_id AND session_id = :session_id AND id > :focus_id AND deleted_at IS NULL
ORDER BY id ASC LIMIT :after;
```

---

### 3.7 `mem_context` → `FormatContext`

Aggregates recent sessions, pinned observations, recent unpinned observations,
and recent prompts for the tenant + project + scope.

```sql
-- Recent sessions
SELECT <session cols> FROM sessions
WHERE tenant_id = :tenant_id [AND LOWER(project) = :project]
ORDER BY datetime(started_at) DESC LIMIT 5;

-- Pinned observations
SELECT <cols> FROM observations
WHERE tenant_id = :tenant_id AND deleted_at IS NULL AND pinned = 1
  [AND LOWER(project) = :project] [AND scope = :scope]
ORDER BY datetime(created_at) DESC, id DESC;

-- Recent unpinned observations
SELECT <cols> FROM observations
WHERE tenant_id = :tenant_id AND deleted_at IS NULL AND pinned = 0
  [AND LOWER(project) = :project] [AND scope = :scope]
ORDER BY datetime(created_at) DESC, id DESC LIMIT :max_context;

-- Recent prompts
SELECT id, session_id, content, project, created_at FROM user_prompts
WHERE tenant_id = :tenant_id [AND LOWER(project) = :project]
ORDER BY created_at DESC LIMIT 10;
```

---

### 3.8 `mem_stats` → `Stats`

```sql
SELECT COUNT(*) FROM sessions WHERE tenant_id = :tenant_id;
SELECT COUNT(*) FROM observations WHERE tenant_id = :tenant_id AND deleted_at IS NULL;
SELECT COUNT(*) FROM user_prompts WHERE tenant_id = :tenant_id;
SELECT project FROM observations
WHERE tenant_id = :tenant_id AND project IS NOT NULL AND deleted_at IS NULL
GROUP BY project ORDER BY MAX(created_at) DESC;
```

---

### 3.9 `mem_save` conflict surfacing → `FindCandidates`

Run automatically inside `AddObservation` after a fresh insert. Not a separate
tool call. Returns up to `limit` (default 3) FTS5 candidates in the same
`tenant_id + project + scope`, excluding the just-saved row, filtered by BM25 floor
(default `-2.0`; include only `score >= floor`). For each surviving candidate, a
pending `memory_relations` row is inserted and its `sync_id` is returned as
`judgment_id`.

```sql
SELECT o.id, ifnull(o.sync_id,'') AS sync_id, o.title, o.type, o.topic_key, fts.rank
FROM observations_fts fts
JOIN observations o ON o.id = fts.rowid
WHERE observations_fts MATCH :fts_query
  AND o.tenant_id = :tenant_id
  AND o.id != :saved_id
  AND o.deleted_at IS NULL
  AND ifnull(o.project,'') = ifnull(:project,'')
  AND o.scope = :scope
ORDER BY fts.rank
LIMIT :limit_times_3;   -- fetch extra, filter by floor in app
```

BM25 floor filter (app-side): `if rc.score < floor { continue }`.

```sql
-- Insert pending relation for each surviving candidate
INSERT INTO memory_relations
  (tenant_id, sync_id, source_id, target_id, relation, judgment_status, session_id)
VALUES
  (:tenant_id, :rel_sync_id, :saved_sync_id, :candidate_sync_id, 'pending', 'pending', :session_id);
```

The agent later resolves these via `mem_judge` / `mem_compare` (§3.10).

---

### 3.10 `mem_judge` / `mem_compare` → relation verdicts

```sql
-- mem_judge: record verdict on a pending relation
UPDATE memory_relations
SET relation = :relation, reason = :reason, evidence = :evidence,
    confidence = :confidence, marked_by_actor = :actor, marked_by_model = :model,
    judgment_status = 'judged', updated_at = datetime('now')
WHERE tenant_id = :tenant_id AND sync_id = :judgment_id AND judgment_status = 'pending';

-- mem_compare: persist an agent-supplied semantic verdict
INSERT INTO memory_relations
  (tenant_id, sync_id, source_id, target_id, relation, confidence, reason, marked_by_model, judgment_status)
VALUES
  (:tenant_id, :rel_sync_id, :mem_a_sync, :mem_b_sync, :relation, :confidence, :reasoning, :model, 'judged');
-- relation = 'not_conflict' is a no-op (empty sync_id, no row inserted)
```

---

### 3.11 `mem_save_prompt` → `AddPrompt`

```sql
INSERT INTO user_prompts (tenant_id, sync_id, session_id, content, project)
VALUES (:tenant_id, :sync_id, :session_id, :content, :project);
```

---

### 3.12 `mem_suggest_topic_key` → `SuggestTopicKey`

Pure function (no DB write). Applies family heuristics:
`architecture/*`, `bug/*`, `decision/*`, `pattern/*`, `config/*`, `discovery/*`,
`learning/*` from `type + title`. Returned value is used as `topic_key` in a
subsequent `mem_save`. No SQL.

---

### 3.13 `mem_session_start` / `mem_session_end` / `mem_session_summary`

```sql
-- start
INSERT INTO sessions (id, tenant_id, project, directory, started_at)
VALUES (:id, :tenant_id, :project, :directory, datetime('now'));

-- end
UPDATE sessions SET ended_at = datetime('now'), summary = :summary
WHERE tenant_id = :tenant_id AND id = :id;

-- summary is just `end` with a summary body; same statement.
```

---

### 3.14 `mem_review` → lifecycle review

```sql
-- list due
SELECT <cols> FROM observations
WHERE tenant_id = :tenant_id AND deleted_at IS NULL
  AND review_after IS NOT NULL AND datetime(review_after) <= datetime('now')
  [AND LOWER(project) = :project]
ORDER BY datetime(review_after) ASC, id ASC LIMIT :limit;

-- mark_reviewed
UPDATE observations SET review_after = :next_review, updated_at = datetime('now')
WHERE tenant_id = :tenant_id AND id = :id AND deleted_at IS NULL;
```

---

### 3.15 `mem_current_project` / `mem_doctor` / `mem_merge_projects` / `mem_capture_passive`

- `mem_current_project`: no DB read of cwd (cloud has none). Resolve from the
  auth tenant's most recent `project` or the explicit `project` argument. Return
  detection envelope `{project, project_source, project_path, cwd, available_projects}`.
- `mem_doctor`: read-only diagnostics — `integrity_check`, row counts per table
  for the tenant, orphaned relations. No mutation.
- `mem_merge_projects`: rename `project` across observations/sessions/prompts for
  the tenant (admin-style, same `from`→`to` normalization).
  ```sql
  UPDATE observations SET project = :to WHERE tenant_id = :tenant_id AND LOWER(project) = :from;
  UPDATE sessions SET project = :to WHERE tenant_id = :tenant_id AND LOWER(project) = :from;
  UPDATE user_prompts SET project = :to WHERE tenant_id = :tenant_id AND LOWER(project) = :from;
  ```
- `mem_capture_passive`: parse `## Key Learnings:` / `## Aprendizajes Clave:`
  sections from text, then call `AddObservation` per extracted item.

---

## 4. Compatibility checklist

| Upstream behavior            | CortextMCP | Notes                                  |
| ---------------------------- | ---------- | -------------------------------------- |
| 20 `mem_*` tools             | ✅         | identical names + signatures           |
| Upsert by `topic_key`        | ✅         | + constant `tenant_id` (single org) scoping        |
| Per-project authorization    | ✅         | `user_project_access` (read/write/admin)          |
| Dedupe 15-min window         | ✅         | same `normalized_hash` logic           |
| FTS5 `bm25()` ranking        | ✅         | Turso supports FTS5                    |
| Conflict surfacing on save   | ✅         | `memory_relations` + `judgment_id`     |
| Soft/hard delete             | ✅         | + relation orphaning on hard delete    |
| `sync_mutations` / chunks    | ❌         | dropped — cloud is source of truth     |
| cwd project detection        | ❌         | replaced by explicit `project`/tenant  |
| Local export/import endpoint | ❌         | not needed — agent copies via `mem_save` |

---

## 5. Migration from local Engram (recommended flow)

1. User keeps **Engram (local) AND CortextMCP** configured as two separate MCP
   servers in the same agent session.
2. User asks the agent: *"Read my Engram memories for project X and copy the ones
   I want into CortextMCP, keeping the same `topic_key` and `type`."*
3. Agent calls `mem_search`/`mem_context` on Engram, then `mem_save` on CortextMCP
   per selected memory.
4. Once satisfied, user can disable Engram.

No bulk import endpoint is required or recommended — the `mem_*` API is the
migration path, which keeps behavior identical and avoids importing stale data.
