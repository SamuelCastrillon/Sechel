# @sechel/server — Sechel MCP Server

Hono server with **MCP StreamableHTTP** endpoint and **Admin REST API** for
managing users, tokens, and instance settings.

---

## Quick Start — pick your profile

### 🧑 Single-user

You just want the MCP endpoint for yourself. Minimal config, one env var, done.

```bash
# 1. .env
DATABASE_URL=file:./sechel-dev.db              # SQLite for local dev
# DATABASE_URL=libsql://your-db.turso.io        # Turso for production
# DATABASE_AUTH_TOKEN=...                       # only for Turso

JWT_SECRET=my-32-char-secret-string-here!!
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password

SECHEL_DEV_TOKEN=sk-my-dev-token                # ← this is all you need for MCP
```

```bash
# 2. Start
pnpm -C apps/server dev
```

```bash
# 3. Connect your MCP client (OpenCode, Claude Code, etc.)
```
```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "http://localhost:3001/mcp",
      "headers": { "Authorization": "Bearer sk-my-dev-token" }
    }
  }
}
```

That's it. `SECHEL_DEV_TOKEN` bypasses all auth — you're admin immediately.

You can **optionally** use the Admin API to create API tokens or manage users:

```bash
# Login → JWT
curl -X POST http://localhost:3001/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-password"}'
# → { "token": "eyJ...", "user": { ... } }

# Create an API token (instead of using SECHEL_DEV_TOKEN)
curl -X POST http://localhost:3001/admin/tokens \
  -H "Authorization: Bearer eyJ..." \
  -H 'Content-Type: application/json' \
  -d '{"description":"my-mcp-token"}'
# → { "raw": "a1b2c3d...", ... }   ← use this as Bearer token for MCP
```

---

### 👥 Team / Multi-user

Multiple agents or developers, each with their own token. Tokens can be
revoked individually. Users have roles (`admin` / `member`).

```bash
# 1. .env
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=...

JWT_SECRET=my-32-char-secret-string-here!!
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password

# SECHEL_DEV_TOKEN=   ← leave unset in production
```

```bash
# 2. Start
pnpm -C apps/server dev
```

```bash
# 3. Login as admin → get JWT
curl -X POST http://localhost:3001/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-strong-password"}'
# → { "token": "eyJ...", "user": { "role": "admin" } }
```

```bash
# 4. Create users
curl -X POST http://localhost:3001/admin/users \
  -H "Authorization: Bearer eyJ..." \
  -H 'Content-Type: application/json' \
  -d '{"username":"juan","password":"secure","role":"member"}'

curl -X POST http://localhost:3001/admin/users \
  -H "Authorization: Bearer eyJ..." \
  -H 'Content-Type: application/json' \
  -d '{"username":"maria","password":"secure","role":"member"}'
```

```bash
# 5. Each user creates their own API token
# (they login with their own credentials and create a token)
curl -X POST http://localhost:3001/admin/tokens \
  -H "Authorization: Bearer <user-jwt>" \
  -H 'Content-Type: application/json' \
  -d '{"description":"open-code-agent"}'
# → each gets their own { "raw": "..." }
```

```bash
# 6. Each client connects with their token
```
```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "http://localhost:3001/mcp",
      "headers": { "Authorization": "Bearer <each-user-raw-token>" }
    }
  }
}
```

**Token lifecycle**: create → give to user → revoke anytime via `DELETE /admin/tokens/:id`. Each token is a SHA-256 hash in the DB; the raw value is shown **once** at creation.

---

## Reference

### Admin REST API

All admin routes are mounted under `/admin` (configurable via `prefix` option).

#### Authentication

Login returns a **JWT**. Send it as:

```
Authorization: Bearer <jwt>
Cookie: session=<jwt>           (for web clients)
```

#### Public routes (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/health` | Health check |
| `POST` | `/admin/auth/login` | Login with username/password |

#### Roles

| Role | Access |
|------|--------|
| `admin` | Full CRUD on users, tokens, settings |
| `member` | `403 Forbidden` on admin routes |

#### Endpoints

##### Auth

```bash
POST /admin/auth/login
Content-Type: application/json

{"username": "admin", "password": "admin123"}

→ 200 { "token": "<jwt>", "user": { "id": 1, "username": "admin", "role": "admin" } }
→ 401 { "error": "Invalid credentials" }
```

##### Users (admin only)

```bash
# List users
GET /admin/users
Authorization: Bearer <jwt>

→ 200 { "users": [{ "id": 1, "username": "admin", "role": "admin", "is_active": 1, "created_at": "..." }] }

# Create user
POST /admin/users
Authorization: Bearer <jwt>
Content-Type: application/json

{"username": "juan", "password": "secure123", "role": "member"}

→ 201 { "id": 2, "username": "juan", "role": "member", "is_active": 1, "created_at": "..." }
→ 400 { "error": "role must be admin or member" }
→ 409 { "error": "Username already exists" }

# Change role
PATCH /admin/users/:id
Authorization: Bearer <jwt>
Content-Type: application/json

{"role": "admin"}

→ 200 { "id": 2, "username": "juan", "role": "admin", "is_active": 1 }
→ 404 { "error": "User not found" }

# Toggle active/inactive
POST /admin/users/:id/toggle-active
Authorization: Bearer <jwt>

→ 200 { "id": 2, "username": "juan", "role": "member", "is_active": 0 }
→ 404 { "error": "User not found" }

# Set project permission
POST /admin/users/:id/permissions
Authorization: Bearer <jwt>
Content-Type: application/json

{"project": "my-project", "permission": "read"}  # read | write | none

→ 204 (no body)
→ 400 { "error": "permission must be read, write, or none" }
```

##### API Tokens (admin only)

Tokens are generated server-side (external tokens are not accepted).
Stored as SHA-256; the raw value is returned **once** at creation.

```bash
# List tokens (no hash, no raw)
GET /admin/tokens
Authorization: Bearer <jwt>

→ 200 { "tokens": [{ "id": 1, "prefix": "sk_a1b2c3d", "description": null, "last_used_at": null, "created_at": "..." }] }

# Create token
POST /admin/tokens
Authorization: Bearer <jwt>
Content-Type: application/json

{"description": "my-dev-token"}  # optional

→ 200 { "id": 1, "prefix": "sk_a1b2c3d", "description": "my-dev-token", "raw": "<80-char-hex>", "created_at": "..." }

# Delete token
DELETE /admin/tokens/:id
Authorization: Bearer <jwt>

→ 204 (no body)
→ 404 { "error": "Token not found" }
```

> **Save the `raw` value** — it is never stored in plain text and cannot be retrieved later.

##### Settings (admin only)

```bash
# Get all settings
GET /admin/settings
Authorization: Bearer <jwt>

→ 200 { "registration_enabled": "true" }

# Update settings (only allowed keys)
PATCH /admin/settings
Authorization: Bearer <jwt>
Content-Type: application/json

{"registration_enabled": "false"}

→ 200 { "registration_enabled": "false" }
→ 400 { "error": "Unknown setting key: ..." }
```

---

### MCP Endpoint

```
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

#### How auth works

`verifyToken()` checks in order:

1. **SECHEL_DEV_TOKEN** — if the Bearer token matches this env var, you're
   granted admin access immediately. For development and single-user setups.
2. **SHA-256 lookup in `user_tokens`** — hashes the token and searches the DB.
   Verifies the user is active.

No token or invalid token → `401 Unauthorized`.

> **Important**: The MCP endpoint does **NOT** accept session JWTs. Use an
> **API token** (created via `POST /admin/tokens`) or `SECHEL_DEV_TOKEN`.

#### Required headers

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <token>` |
| `Content-Type` | `application/json` |
| `Accept` | `application/json, text/event-stream` |

Missing `Accept: text/event-stream` → `406 Not Acceptable`.

#### Exposed tools

The server exposes 21 `mem_*` tools (identical to Engram's API):

| Tool | Description |
|------|-------------|
| `ping` | Health check |
| `mem_save` | Save observation (upsert by topic_key) |
| `mem_search` | FTS5 full-text search |
| `mem_get_observation` | Full content by ID |
| `mem_context` | Recent session context |
| `mem_update` | Update existing observation |
| `mem_delete` | Delete (soft or hard) |
| `mem_stats` | Tenant statistics |
| `mem_current_project` | Detect active project |
| `mem_suggest_topic_key` | Suggest stable topic_key |
| `mem_pin` / `mem_unpin` | Pin/unpin to context |
| `mem_save_prompt` | Save user prompt |
| `mem_session_start/end/summary` | Session lifecycle |
| `mem_judge` | Conflict verdict |
| `mem_compare` | Compare memories |
| `mem_review` | Lifecycle review |
| `mem_doctor` | Operational diagnostics |
| `mem_merge_projects` | Rename projects |
| `mem_capture_passive` | Extract learnings from text |

#### MCP flow example

```bash
# 1. Initialize
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-05","capabilities":{},"clientInfo":{"name":"my-client","version":"1.0"}}}'

# 2. List tools
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. Save a memory
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{"name":"mem_save","arguments":{"title":"My memory","content":"# Test","type":"discovery"}}
  }'

# 4. Search
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"mem_search","arguments":{"query":"My memory"}}
  }'
```

---

### Local development

```bash
npx tsx apps/server/dev.ts
```

This creates `sechel-dev.db` in `apps/server/`, runs migrations, seeds the
default admin, and starts on `http://localhost:3001`.

#### Default dev credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |
| Dev token | `sk-dev-token` (for MCP) |

Configurable via env vars: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SECHEL_DEV_TOKEN`.

#### Tests

```bash
pnpm -C apps/server test        # 40 tests (admin CRUD + MCP + auth)
pnpm -C apps/server test:watch  # watch mode
```

---

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Turso URL (`libsql://...`) or SQLite (`file:...`) |
| `DATABASE_AUTH_TOKEN` | Yes* | Turso access token |
| `JWT_SECRET` | Yes | JWT signing secret for admin sessions (32+ chars) |
| `ADMIN_USERNAME` | No | Initial admin username (auto-seeded on first run) |
| `ADMIN_PASSWORD` | No | Initial admin password |
| `SECHEL_DEV_TOKEN` | No | Dev token — bypasses auth for MCP endpoint |
| `TENANT_ID` | No | Tenant ID (default: `"default"`) |

\* Not required for embedded databases (`file:` / `:memory:`).

---

### OpenCode configuration

```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer <api-token-or-dev-token>"
      }
    }
  }
}
```

---

### Deployment

#### Docker

```bash
docker build -t sechel-server -f apps/server/Dockerfile .
docker run -e DATABASE_URL=... -e DATABASE_AUTH_TOKEN=... \
  -e JWT_SECRET=... -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=... \
  -e SECHEL_DEV_TOKEN=sk-my-token -p 3001:3001 sechel-server
```

#### Cloudflare Workers

```bash
pnpm -C apps/server deploy:cf
```

#### Vercel

Vercel deploys the server as a serverless function via the **Hono** framework
preset — the default export in `src/index.ts` is the entry point (no `api/`
functions or rewrites needed).

**Prereqs**: a Turso database URL + auth token, plus `JWT_SECRET` and
`TENANT_ID`.

**Vercel project setup**: Root Directory = `apps/server`, Framework Preset =
**Hono**. Set these env vars: `DATABASE_URL` (`libsql://...`),
`DATABASE_AUTH_TOKEN`, `JWT_SECRET`, `TENANT_ID`, and optionally
`ADMIN_USERNAME` / `ADMIN_PASSWORD` and `SECHEL_DEV_TOKEN`.

**Seed the DB first**: `ensureSeeded()` only runs on the Node entry, so seed
the Turso database beforehand — e.g. run `pnpm --filter @sechel/server start`
once locally with `DATABASE_URL` / `DATABASE_AUTH_TOKEN` pointing at the remote
DB, or use the dev entry / a script.

```bash
pnpm -C apps/server deploy:vercel
# or, from apps/server: vercel deploy --prod
```

---

### Multi-user with Panel

When deployed alongside `apps/panel`, user and token management is done through
the Astro admin UI. The server only exposes the MCP endpoint.

See [`apps/panel/README.md`](../panel/README.md) for the full deployment guide.

---

### License

MIT — see [LICENSE](../../LICENSE) at the repo root.
