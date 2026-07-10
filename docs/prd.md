# Sechel — Product Requirements Document

Sechel is an **open-source, self-hosted memory server** that exposes Engram's
`mem_*` tools over MCP-HTTP with **100% behavioral compatibility**, so any MCP agent
keeps working unchanged. Each organization, team, or solo developer deploys their own
instance. Inside one instance, multiple users share memories organized by **project**,
and an **admin** controls which projects each user may read or write.

## Quick path

1. Read **Vision & positioning** — why self-hosted and why Engram-compatible.
2. Read **Personas** and **Core concepts** — who uses it and how data is shaped.
3. Read **Functional scope** and **Out of scope** — what we build and what we deliberately cut.
4. Read **Compatibility contract** and **Success criteria** — how "done" is defined.

## Vision & positioning

- **Open source, self-hosted.** Users run their own instance from source (Vercel +
  Turso/libSQL). No managed service is provided.
- **Not a multi-organization SaaS.** Isolation between organizations is achieved by
  *separate deployments*, not by schema design. This is a deliberate scope cut (see
  Out of scope).
- **Value.** A drop-in, cloud-native Engram replacement with zero behavior change for
  agents, plus team sharing via per-project permissions.

## Personas

| Persona   | Description                                  | Needs                                              |
| --------- | -------------------------------------------- | -------------------------------------------------- |
| Admin     | First user / operator of an instance         | Create users, assign project permissions, full access |
| Member    | Regular user in a team instance              | Read/write/modify memories of the projects granted to them |
| Solo dev  | Single user, no team                         | Use `mem_*` exactly like local Engram              |

## Core concepts

- **Instance** — one deployment = one organization/team/person. Has a single implicit
  org identity; it never mixes data with other instances.
- **User** — an authenticated identity (bearer token). Roles: `admin` or `member`.
- **Project** — the unit memories are grouped by (already a column in the schema).
  Multiple users can access the same project.
- **Memory (observation)** — a `mem_*` record, owned by a **project**, not by a user.
- **Permission** — a grant of a user over a project: `read` / `write` / `admin`.
  `admin` can also manage users and grants.

## Functional scope

### In scope (long-term goal: full compatibility)

- All 20 `mem_*` tools with identical names, arguments, and response envelopes to
  Engram (specified in `docs/engram-query-reference.md`).
- User accounts and authentication (bearer token).
- Per-project authorization via `user_project_access`.
- Admin operations: create users, assign/revoke project permissions, promote to admin.
- Self-hosted deployment (Vercel + Turso/libSQL).

### Build phasing

| Slice | Delivers                                              | Depends on            |
| ----- | ----------------------------------------------------- | --------------------- |
| 1     | Storage schema + FTS5 + `mem_save` + `mem_search`     | Kysely, Vitest        |
| 2     | Remaining 18 `mem_*` tools                            | Slice 1               |
| 3     | Real auth (bearer → users) + `user_project_access` enforcement | Slice 1 schema |
| 4     | Admin user/permission management + admin panel UI    | Slice 3               |

The slice split is recorded as an architecture decision; it proves the foundation and
parity tests before expanding surface.

## Out of scope

- **Multi-organization (company-level) tenancy inside one database.** Each org runs its
  own instance.
- A managed/hosted Sechel service.
- Bulk import from local Engram (agents copy selected memories via `mem_save`).
- Cross-instance sharing of memories.

## Compatibility contract (100% Engram)

- Tool names, arguments, and response envelopes match Engram.
- `mem_save` upsert / dedupe-window / conflict-surfacing semantics are identical.
- `mem_search` FTS5 + `bm25()` ranking is identical (Turso supports FTS5).
- Behavior is defined and verified by **behavior-parity tests**
  (`docs/data-testing-strategy.md`), not by intuition.
- Intentional divergences only: cloud has no `cwd` (project resolved explicitly or from
  session); no local `sync_mutations` / `sync_chunks` tables (cloud is source of truth).

## Non-functional requirements

- **Storage:** Turso / libSQL (SQLite-compatible). Adequate for a single org/team's
  workload; WAL mode handles a team's write concurrency.
- **Transport:** MCP over Streamable HTTP on Vercel (Next.js 15).
- **Query layer:** Kysely (typed builder, not an ORM) over `@libsql/client`.
- **Testing:** Vitest; behavior parity is the definition of "compatible".

## Success criteria

- [ ] Any MCP agent using Engram's `mem_*` works unchanged against Sechel.
- [ ] A member can only read/write the projects they are granted.
- [ ] An admin can create users and assign/revoke project permissions.
- [ ] Parity tests pass for every shipped tool.

## Open questions

- Permission granularity: is `read` / `write` / `admin` enough, or is a finer
  modify-only level needed?
- How is the **first admin** bootstrapped on a fresh instance (seed user / env credential)?
- Should a memory record which user authored it (audit trail)? The current schema has
  no `user_id` on `observations`.

## Next step

See `docs/architecture.md` for how the PRD is built, and
`docs/data-testing-strategy.md` for the locked testing decisions.
