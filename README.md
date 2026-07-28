# Sechel

Persistent memory for AI agents. Deployable anywhere — Vercel, Cloudflare
Workers, Docker, or your own server.

Agents (Claude Code, OpenCode, Cursor, Gemini CLI, etc.) connect via **MCP
over HTTP** and use tools like `mem_save`, `mem_search`, `mem_context` to
read and write memory that persists across sessions. Memory lives in the cloud
(Turso / libSQL), isolated by tenant.

---

## Why

AI agents need memory to be useful beyond a single conversation — but most
memory solutions are local binaries that can't run on serverless platforms.

Sechel provides the same memory tools your agent already expects, but as an
HTTP endpoint:

- **MCP Streamable HTTP** — works on serverless, edge, and traditional runtimes.
- **Cloud database** — Turso (libSQL) instead of a local SQLite file.
- **Multi-tenant** — each user or team gets isolated memory by `tenant_id`.
- **Auth built-in** — JWT sessions, Argon2id passwords, SHA-256 API tokens.
- **Admin API** — manage users, tokens, and settings at runtime.

---

## Quick start

```bash
# One-command local CLI (stdio)
npx sechel
```

```bash
# Or deploy the server (HTTP)
pnpm -C apps/server dev
```

```bash
# Connect your agent
```
```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "http://localhost:3001/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

---

## Stack

- **Runtime:** Node.js, Cloudflare Workers, Deno
- **Server:** Hono (MCP Streamable HTTP)
- **Panel:** Astro + React islands + Tailwind CSS v4
- **DB:** Turso / libSQL (via `@libsql/client`)
- **Auth:** JWT (jose), Argon2id (hash-wasm), SHA-256 API tokens
- **Package manager:** pnpm 9.15
- **Published as:** npm (`@sechel-mcp/core`, `@sechel-mcp/mcp-server`, `@sechel-mcp/cli`)

---

## Usage profiles

Pick the one that fits your case:

| Profile | Component | README | Best for |
|---------|-----------|--------|----------|
| **Local** | `apps/cli` | [`apps/cli/README.md`](apps/cli/README.md) | Local use with embedded SQLite, no cloud dependency |
| **Single-user** | `apps/server` | [`apps/server/README.md`](apps/server/README.md) | One user, remote MCP endpoint, no admin UI |
| **Multi-user** | `apps/panel` + `apps/server` | [`apps/panel/README.md`](apps/panel/README.md) | Teams, visual user and token management |

### Local (CLI)

```bash
npx sechel
```

No config, no cloud. The DB is created automatically in `~/.config/sechel/`.
Connect your MCP client via stdio.

See [`apps/cli/README.md`](apps/cli/README.md).

### Single-user (server standalone)

A Hono process exposing the MCP over HTTP endpoint + Admin REST API.
Ideal for deploying to Vercel, Cloudflare Workers, or Docker for personal use.

```bash
export DATABASE_URL=libsql://...
export DATABASE_AUTH_TOKEN=...
export JWT_SECRET=my-32-char-secret-string-here
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=my-strong-password
export SECHEL_DEV_TOKEN=sk-my-dev-token

pnpm -C apps/server dev
```

**MCP endpoint**: `POST /mcp` — auth via `Authorization: Bearer <token>`.

**Admin REST API**: `POST /admin/auth/login` → JWT. CRUD for users, tokens,
and settings under `/admin/*`. Roles: `admin` and `member`.

See [`apps/server/README.md`](apps/server/README.md).

### Multi-user (panel + server)

The Astro panel embeds the Hono server in the same process. Includes:

- Login/register with JWT + HttpOnly cookies
- Dashboard with system status
- User CRUD with roles and project permissions
- API token management
- Runtime instance configuration

```bash
pnpm -C apps/panel dev
```

See [`apps/panel/README.md`](apps/panel/README.md).

---

## Monorepo structure

```
sechel/
├── packages/
│   ├── core/            ← @sechel-mcp/core — createDb, verifyToken, domain
│   └── mcp-server/      ← @sechel-mcp/mcp-server — createSechelServer factory
├── apps/
│   ├── cli/             ← @sechel-mcp/cli — local usage via stdio
│   ├── server/          ← @sechel/server — Hono HTTP, MCP endpoint
│   └── panel/           ← @sechel/panel — Astro admin panel
├── modules/             ← Backward-compat re-exports (legacy Next.js)
├── docs/
│   ├── engram-query-reference.md
│   └── architecture.md
└── app/                 ← Legacy Next.js app (migration in progress)
```

---

## OpenCode configuration

```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "https://<your-deployment>/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

---

## Compatibility

Sechel implements the same `mem_*` tool interface as
[Engram](https://github.com/Gentleman-Programming/engram) — upsert by
`topic_key`, 15-minute dedupe window, FTS5 + `bm25()`, conflict surfacing.

If your workflow already uses Engram, point your client to Sechel instead and
it works with zero changes. Name the server `engram` in your MCP config to
keep existing `engram_*` tool prefixes.

See [`docs/engram-query-reference.md`](docs/engram-query-reference.md) for the
full SQL reference per tool.

---

## Roadmap

- [x] Multi-tenant schema + FTS5
- [x] 24 `mem_*` tools implemented
- [x] Real auth: Argon2id, JWT, SHA-256 API tokens
- [x] Local CLI (`@sechel-mcp/cli`)
- [x] Hono server with StreamableHTTP (`@sechel/server`)
- [x] Admin REST API (JWT login, CRUD users/tokens/settings, roles)
- [ ] Multi-user panel complete (Astro)
- [ ] Conflict surfacing (`mem_save` → `FindCandidates` → `memory_relations`)

---

## License

MIT — see [LICENSE](LICENSE).

Sechel is an original project under the MIT license. It does not contain source
code from Engram, but the query specification in
[`docs/engram-query-reference.md`](docs/engram-query-reference.md) is derived
from Engram's internal store to maintain 100% tool compatibility.

- [Engram](https://github.com/Gentleman-Programming/engram) — © 2026 Alan Buscaglia (MIT)
- [Sechel](LICENSE) — © 2026 samcasdev (MIT)
