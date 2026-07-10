# Data Layer & Testing Strategy — Sechel

Authoritative decisions for the Sechel cloud memory server. These choices
are locked: any implementation MUST follow them.

- Stack/transport context: Next.js 15 + React 19, MCP over HTTP (Vercel),
  Turso/libSQL, `mcp-handler`. See `README.md` and
  `docs/engram-query-reference.md` (the SQL compatibility spec).

---

## 1. Data access: Kysely (NOT an ORM)

### Decision

Use **Kysely** as the typed query builder over `@libsql/client`. Do **not** use
a full ORM (Prisma, Drizzle ORM, etc.).

### Rationale

1. **Compatibility contract is raw SQL.** `docs/engram-query-reference.md`
   documents the exact upstream Engram queries: `topic_key` upsert,
   `normalized_hash` dedupe window, FTS5 `MATCH` + `bm25()` ranking, and
   FTS5 sync triggers. These are engine-specific constructs. A full ORM
   abstracts them poorly or not at all, forcing raw SQL *inside* the ORM —
   the worst of both worlds. Kysely, by contrast, emits real SQL and only
   adds typesafety on top; FTS5, `bm25()`, `datetime('now','-15 minutes')`,
   and triggers pass through unchanged.
2. **Small, critical surface.** Four tables (`observations`, `sessions`,
   `user_prompts`, `memory_relations`). An ORM's cost is not justified here;
   it only adds a translation layer that can silently drift behavior away
   from Engram.
3. **Parity with upstream.** Engram uses `sql.DB` directly. Kysely over
   libSQL keeps us closest to that execution model while giving row typing.

### Rules

- Kysely is a **query builder**, not a migration tool. Use a separate
  versioned migration runner (see §3) for DDL.
- Express FTS5 / `bm25()` / trigger logic via Kysely's `.raw()` or raw SQL
  fragments where the builder is insufficient. Compatibility beats builder purity.
- Every `mem_*` tool validates its **input** with Zod at the MCP boundary.
  Kysley types the **rows**. Zod (input) + Kysely (rows) is the typing strategy.
- `tenant_id` is a **constant per instance** (set from config). Never accept it
  from a user token. Every query builds from a tenant-scoped base
  (`db.selectFrom('observations').where('tenant_id', '=', instanceOrgId)`).
- Never bypass the **per-project permission guard**. Every memory operation
  resolves the caller's `user_id` + `role` and verifies a `user_project_access`
  grant (or `admin` role) for the target project before executing.

---

## 2. Testing strategy (TDD-first)

### Principle

The primary risk of this project is **behavioral divergence from Engram**, not
crashes. A tool that "works" but ranks search differently, or creates duplicate
rows instead of upserting, breaks the 100%-compatibility promise. Tests define
what "compatible" means.

### Test levels (all required)

#### L1 — Behavior parity tests (highest priority)
Reproduce upstream Engram cases and assert the result matches. Must cover:

- `mem_save` with same `topic_key` twice → single row, `revision_count`
  increments (no second row).
- `mem_save` of identical content twice within 15 min → `duplicate_count`
  increments, no new row.
- `mem_search "jwt auth"` → same BM25 ordering as upstream (deterministic).
- `mem_delete` hard → row gone AND referencing `memory_relations` become
  `orphaned`.
- Conflict surfacing: two opposing architecture `mem_save` calls →
  `judgment_required: true` + `candidates[]` returned.
- `mem_update` partial → only supplied fields change, `revision_count++`.
- Soft delete → row excluded from `mem_search` / `mem_context` / `mem_timeline`.

#### L2 — Project authorization tests (security-critical)
- Member without a grant on project X gets empty/403 from `mem_search` / `mem_get` /
  `mem_context` on X.
- Member with `read` only on X is rejected on `mem_save` / `mem_update` / `mem_delete`
  (needs `write`/`admin`).
- `admin` role sees and writes all projects with no `user_project_access` row.
- `sync_id` collisions across projects do not merge or error.
- `mem_search` for a user never returns rows from a project they are not granted.

#### L3 — MCP integration tests (real boundary)
- Use the MCP SDK to send a real `tools/call` to the `/api/mcp` handler in a
  test runtime (no Vercel needed).
- Assert the response envelope (`project`, `result`, error shape) matches
  upstream `mem_*` contract.
- Cover auth: stub token accepted; missing token rejected (`required: true`).

### Infrastructure

- **Runner:** Vitest (fits the TS/Next ecosystem already in `package.json`).
- **DB for tests:** libSQL in-memory or ephemeral file
  (`file::memory:?cache=shared` or a temp `.turso`), schema created fresh per
  test file via the migration runner. No remote Turso in CI.
- **Seeds:** fixture observations for search/parity tests.
- **CI:** `pnpm test` runs without a remote database.

### Order of work (TDD)

1. Write migration that creates the multi-tenant schema + FTS5 triggers.
2. Write L1 + L2 tests (red) against the documented SQL behavior.
3. Implement the 20 `mem_*` tools with Kysely until tests go green.
4. Add L3 MCP integration tests.

Tests are the definition of "Engram-compatible". No tool is "done" until its L1
parity test passes.

---

## 3. Migrations

- Versioned, sequential migration files (e.g. `migrations/0001_init.sql`).
- Applied by a small runner at startup (dev) and in a CI step; idempotent
  (`IF NOT EXISTS`, guard by a `_migrations` table).
- DDL includes: constant `tenant_id` columns, FTS5 virtual tables, the three FTS5
  sync triggers, `memory_relations`, plus `users`, `projects`, and
  `user_project_access`. Mirrors `docs/engram-query-reference.md` §2.
- `sync_mutations` / `sync_chunks` are intentionally absent (cloud is source of truth).

---

## 4. Summary of locked decisions

| Topic            | Decision                                  |
| ---------------- | ----------------------------------------- |
| Query layer      | Kysely (typed builder), NOT an ORM        |
| Migrations       | Versioned raw SQL, separate runner        |
| Input validation | Zod at MCP boundary                       |
| Row typing       | Kysely types                              |
| Test runner      | Vitest                                    |
| Test DB          | libSQL in-memory / ephemeral, no remote   |
| First work       | Schema + parity tests (red) before tools  |
| Authorization    | Per-project guard via `user_project_access` (admin = all) |
| Compatibility    | Defined by L1 parity tests, not by feel   |
