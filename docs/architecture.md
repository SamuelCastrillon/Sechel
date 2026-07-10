# Sechel — Architecture

Sechel is built as a **Next.js 15 MCP-HTTP server on Vercel** backed by
**Turso/libSQL via Kysely**, with a **permission guard** that enforces per-project
access for authenticated users, while keeping **100% behavioral compatibility** with
Engram's `mem_*` tools. This document explains how the `docs/prd.md` scope is realized.

## Quick path

1. **Deployment model** — self-hosted, one instance per org.
2. **Data model (revised)** — constant org id + projects + users + `user_project_access`.
3. **Access control / guard** — bearer token → user → project permission check.
4. **Compatibility layer** — `mem_*` tools mapped to exact Engram SQL.
5. **Phasing & testing** — build order and how "compatible" is proven.

## Deployment model

- **Self-hosted:** one instance per organization/team/person. No cross-org data lives in
  one database.
- **Stack:** Vercel (Next.js 15) + Turso (libSQL). The libSQL HTTP protocol is
  serverless-friendly; no connection pooler is required (unlike raw Postgres on Vercel).
- **Revision note:** the earlier "multi-tenant by `tenant_id`" framing in
  `docs/engram-query-reference.md` and `docs/data-testing-strategy.md` assumed
  company-level isolation. Under the PRD model, `tenant_id` becomes a **single constant
  org id per instance** (injected from instance config, not from multi-company auth).
  Real isolation is **user ↔ project**. Those two docs need a revision pass to match.

## Data model (revised)

Keep Engram's four tables — `sessions`, `observations`, `user_prompts`,
`memory_relations` — plus FTS5 virtual tables and sync triggers. Changes versus the
current query reference:

- `tenant_id`: a single per-instance org identifier (effectively constant). Kept to
  minimize SQL churn; it scopes every query so a bug cannot cross instances.
- Add `users` — `id`, `username`/`email`, `role` (`admin`|`member`), credential hash,
  `created_by`.
- Add `projects` — `id`, `name` (FK target for permissions; enables grants without
  relying on free-text `project`).
- Add `user_project_access` — `user_id`, `project_id`, `permission`
  (`read`|`write`|`admin`).
- `observations.project` already exists; memory access is gated by the user's grants on
  that project.

| Concern                | Decision                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `tenant_id` constant   | one instance = one org; inter-org isolation = separate deploy   |
| `users`                | bearer-token auth, `admin`/`member` roles                       |
| `user_project_access`  | per-project RBAC (`read`/`write`/`admin`)                       |
| memories               | scoped by `project`, shared among granted users                 |

## Access control / guard

- **Auth:** bearer token → resolve `user_id` + `role`.
- **Guard:** for any memory operation on project `X`, verify `user_project_access`
  grants the required level — `read` for `search`/`get`/`context`/`timeline`/`stats`;
  `write` for `save`/`update`/`delete`/`judge`. `admin` role implies all projects.
- This **replaces** the old "inject `tenant_id` to prevent cross-company leak" guard.
  The guard now prevents **unauthorized cross-project** access.
- **Defense in depth:** keep `tenant_id` (constant) scoping in queries so an instance
  boundary is never crossed even on a logic bug.

## Compatibility layer

- Each `mem_*` tool is implemented as a Kysely / raw-SQL query that matches
  `docs/engram-query-reference.md` exactly: topic-key upsert, 15-minute dedupe window,
  FTS5 `bm25()` ranking, and conflict surfacing via `memory_relations`.
- **Zod** validates input at the MCP boundary; **Kysely** types the rows.
  (Zod = input, Kysely = rows.)
- `project` / `scope` are resolved from the request (cloud has no `cwd`).

## Module structure (target)

The codebase will move from a flat `lib/` layout to a **screaming-architecture** layout
by capability. Current state is flat `lib/` (`db`, `auth`, `store`, `validation`,
`migrations`); the following is the agreed target.

```
app/                        # thin Next.js adapter: routes, layouts, entry points
  layout.tsx
  page.tsx
  api/mcp/route.ts          # ~5 lines: imports handler from modules/mcp
  admin/{layout,page,login} # pages call modules/panel (server)
  .well-known/...
modules/
  core/                     # shared kernel — no Next, no UI, no client
    db/                     # kysely client, migrations, db-types (+ server-only)
    auth/                   # verifyToken, authorize, RBAC primitive
    domain/                 # store (data access), zod schemas, types (+ server-only)
    index.ts                # public API of core
  mcp/                      # MCP capability
    server.ts               # createMcpHandler wiring (real logic)
    tools/                  # ping, mem_save, mem_search (delegate to core/domain)
    index.ts
  panel/                    # Admin panel capability
    actions/                # Server Actions -> call core/domain
    components/             # UI (client + server)
    auth/                   # panel session/login (reuses core/auth)
    index.ts
```

Agreed principles:

- `app/` is a **thin delivery adapter**, not "just navigation" — route handlers delegate
  to `modules/*`.
- `core` is the **single data-access + auth-primitive layer**; both `mcp` and `panel`
  reuse it. No second data-access layer.
- Each capability is a **vertical slice** (logic + UI together). MCP keeps its logic
  inside `modules/mcp`; the panel keeps its server logic inside `modules/panel/actions`
  (Server Actions) — **not** in a separate top-level `modules/api`.
- `core/db`, `core/auth`, `core/domain/store` carry `import 'server-only'` to prevent
  server code leaking into client bundles.
- Auth: `core/auth` holds the primitive (`verifyToken`, `authorize`, RBAC lookup). MCP
  builds stateless bearer sessions per request; the panel builds Next cookie/session on
  top — both call the same `authorize()`.
- A separate `modules/api` was explicitly **rejected**: "queries the panel uses" would
  duplicate `core/domain` and break vertical-slice consistency. A real HTTP/JSON API for
  the panel is only introduced if external clients need it, and would still live inside
  the `panel` vertical (`app/api/admin/*` -> `modules/panel/server`).

## Phasing

| Slice | Delivers                                                          | Depends on            |
| ----- | ----------------------------------------------------------------- | --------------------- |
| 1     | Schema + FTS5 + `mem_save` / `mem_search` + parity tests          | Kysely, Vitest        |
| 2     | Remaining 18 `mem_*` tools                                        | Slice 1               |
| 3     | Real auth (bearer → `users`) + `user_project_access` enforcement  | Slice 1 schema        |
| 4     | Admin user/permission management + admin panel UI                 | Slice 3               |

## Testing

- **Behavior-parity (L1)** is the definition of "compatible" (`docs/data-testing-strategy.md`).
- The old "tenant isolation" security tests are **replaced by project-authorization
  tests**: a member without a grant gets empty/403; an admin sees all; a user never
  reads a project they are not granted.
- **Vitest** + libSQL in-memory / ephemeral file; no remote DB in CI.

## Scalability note

A single-org instance is well within SQLite/libSQL limits. Write contention is
per-instance (a team's traffic), not cross-company. WAL mode absorbs concurrent writes;
if read scale is ever needed, Turso primary + edge replicas scale reads transparently
without code changes.

## Open decisions

- First-admin bootstrap on a fresh instance (seed user or env-provided credential).
- Whether `observations` should carry an authoring `user_id` for audit.
- Final permission granularity (`read`/`write`/`admin` vs. finer levels).

## Next step

Implement Slice 1 (schema + `mem_save`/`mem_search`) following
`docs/data-testing-strategy.md`; then revise `docs/engram-query-reference.md` to reflect
the constant `tenant_id` + project-RBAC model.
