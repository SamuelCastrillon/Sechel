# @sechel/server — Sechel MCP Server

Servidor Hono con **endpoint MCP StreamableHTTP** y **Admin REST API** para
gestionar usuarios, tokens y la configuración de la instancia.

---

## Resumen — elija su perfil

- [**Perfil A — Usuario único** (`SECHEL_DEV_TOKEN`)](#perfil-a-usuario-unico-sechel_dev_token): un token para usted mismo — un servidor **desplegado** al que accede de forma remota desde varias máquinas, o que comparte con sus propios agentes remotos. Para desarrollo solo local, prefiera el [CLI](../cli/README.md).
- [**Perfil B — Multi-usuario** (tokens de API reales)](#perfil-b-multi-usuario-tokens-de-api-reales--el-flujo-de-produccion): el flujo de producción — tokens de API por cliente, revocables de forma individual.

La única diferencia entre ambos es cómo el endpoint MCP lo autentica a usted:
el token de desarrollo omite toda la autenticación; los tokens reales se
verifican contra la base de datos. Todo lo demás (Admin API, herramientas,
despliegue) es compartido.

---

## Perfil A: Usuario único (SECHEL_DEV_TOKEN)

Usted quiere el endpoint MCP para usted mismo en un servidor **desplegado**.
Configuración mínima, una variable de entorno, listo. Es la elección correcta
cuando despliega el servidor una vez (Vercel, Docker, Cloudflare) y se conecta
desde varias máquinas o agentes remotos — todos comparten el mismo token.

> **Alcance**: un servidor **desplegado de un solo usuario**.
> `SECHEL_DEV_TOKEN` se define una vez en el entorno del servidor y se usa como
> token Bearer desde cualquier máquina. **Omite toda la autenticación** — un
> token Bearer que coincida recibe **acceso de admin de inmediato**, y
> cualquiera que conozca el token de desarrollo es admin. Como todos los
> clientes comparten un único token, este perfil **no** es para compartir el
> servidor con otras personas; para múltiples usuarios use el
> [Perfil B](#perfil-b-multi-usuario-tokens-de-api-reales--el-flujo-de-produccion).
> Si solo necesita el endpoint MCP para **desarrollo local** (una máquina, sin
> despliegue), prefiera el CLI independiente (`sechel`, ver
> [apps/cli](../cli/README.md)) — ejecuta un servidor local por stdio con su
> propia base de datos SQLite, sin necesidad de red.

**1. `.env`** — configuración mínima (servidor desplegado → base Turso):

```bash
DATABASE_URL=libsql://your-db.turso.io          # Turso for production
DATABASE_AUTH_TOKEN=...                          # only for Turso
# DATABASE_URL=file:./sechel-dev.db              # SQLite (solo local, ver CLI)

JWT_SECRET=my-32-char-secret-string-here!!
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password

SECHEL_DEV_TOKEN=sk-my-dev-token                # ← this is all you need for MCP
```

**2. Despliegue el servidor** (ver [Despliegue](#despliegue)) y configure las
variables de entorno de arriba.

**3. Conecte su cliente MCP** (OpenCode, Claude Code, etc.) a la URL desplegada:

```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "https://your-server.example/mcp",
      "headers": { "Authorization": "Bearer sk-my-dev-token" }
    }
  }
}
```

Eso es todo — `SECHEL_DEV_TOKEN` omite toda la autenticación, por lo que usted
es admin de inmediato.

Puede **opcionalmente** usar la Admin API para crear tokens de API o gestionar
usuarios en lugar de depender del token de desarrollo:

```bash
# Login → JWT
curl -X POST https://your-server.example/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-password"}'
# → { "token": "eyJ...", "user": { ... } }

# Create an API token (instead of using SECHEL_DEV_TOKEN)
curl -X POST https://your-server.example/admin/tokens \
  -H "Authorization: Bearer eyJ..." \
  -H 'Content-Type: application/json' \
  -d '{"description":"my-mcp-token"}'
# → { "raw": "a1b2c3d...", ... }   ← use this as Bearer token for MCP
```

---

## Perfil B: Multi-usuario (tokens de API reales) — el flujo de producción

Varios agentes o desarrolladores, cada uno con su propio token. Los tokens se
pueden revocar de forma individual. Los usuarios tienen roles
(`admin` / `member`).

Estos pasos asumen un servidor **ya desplegado** — este es el flujo validado en
vivo contra un despliegue de Vercel.

**1. `.env`** — configuración de producción. `SECHEL_DEV_TOKEN` DEBE estar
vacío o sin definir:

```bash
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=...

JWT_SECRET=my-32-char-secret-string-here!!
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password

# SECHEL_DEV_TOKEN=   ← MUST be empty/unset in production
```

**2. Despliegue** — Docker, Cloudflare Workers o Vercel. Consulte
[Despliegue](#despliegue).

**3. Verifique el estado (health):**

```bash
curl https://your-server.com/admin/health
# → 200 { "status": "ok", ... }
```

**4. Inicie sesión como admin → JWT:**

```bash
curl -X POST https://your-server.com/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-strong-password"}'
# → { "token": "eyJ...", "user": { "role": "admin" } }
```

**5. Cree un token de API** — el valor `raw` se muestra una **única** vez:

```bash
curl -X POST https://your-server.com/admin/tokens \
  -H "Authorization: Bearer eyJ..." \
  -H 'Content-Type: application/json' \
  -d '{"description":"open-code-agent"}'
# → { "raw": "<80-char-hex>", ... }   ← save this NOW
```

**6. Cada cliente se conecta con su propio token** a `POST /mcp`:

```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "https://your-server.com/mcp",
      "headers": { "Authorization": "Bearer <each-client-raw-token>" }
    }
  }
}
```

**7. Ciclo de vida del token:** revoque en cualquier momento mediante
`DELETE /admin/tokens/:id`. Los tokens se almacenan solo como hash SHA-256, por
lo que el valor `raw` **no se puede recuperar** — si se pierde, revoque y
vuelva a crearlo.

---

## Solución de problemas / Errores comunes

Problemas detectados en la práctica y cómo evitarlos.

### Windows PowerShell: use `curl.exe` y comillas simples

PowerShell asigna un alias a `curl` hacia `Invoke-WebRequest`, lo que corrompe
las opciones de curl. Use `curl.exe` de forma explícita.

Cuerpos JSON: **comillas simples por fuera, comillas dobles normales por
dentro**. NO escape las comillas con barras invertidas:

```powershell
# ✔ correct — single quotes outside, plain double quotes inside
curl.exe -X POST http://localhost:3001/admin/auth/login `
  -H 'Content-Type: application/json' `
  -d '{"username":"admin","password":"your-password"}'

# ✘ wrong — backslash-escaped quotes corrupt the payload
curl.exe -X POST http://localhost:3001/admin/auth/login `
  -H 'Content-Type: application/json' `
  -d "{\"username\":\"admin\",\"password\":\"your-password\"}"
# → 400 { "error": "username and password are required" }
```

La continuación multilínea en PowerShell usa el backtick `` ` `` — no `\` (eso
es bash).

### El endpoint /mcp NO acepta JWTs de sesión

`/mcp` solo acepta **tokens de API** (creados mediante `POST /admin/tokens`,
almacenados como SHA-256 en `user_tokens`) o `SECHEL_DEV_TOKEN`. Un JWT de
`POST /admin/auth/login` devuelve `401 Unauthorized` en `/mcp` — eso es
esperado por diseño. Use el JWT solo para la Admin REST API.

### Guarde el valor raw del token de inmediato

El valor `raw` se devuelve **una vez** en la creación y se almacena solo como
hash SHA-256. Nunca se puede volver a consultar. Si lo pierde, revoque y
vuelva a crearlo.

### Genere un JWT_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Verifique el pipeline completo

estado (health) → inicio de sesión → creación de token → inicialización MCP →
ping:

```bash
# 1. Health
curl https://your-server.com/admin/health

# 2. Login → capture the JWT
curl -X POST https://your-server.com/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-password"}'

# 3. Create an API token → capture the raw value
curl -X POST https://your-server.com/admin/tokens \
  -H "Authorization: Bearer <jwt>" \
  -H 'Content-Type: application/json' \
  -d '{"description":"pipeline-test"}'

# 4. MCP initialize
curl -X POST https://your-server.com/mcp \
  -H "Authorization: Bearer <raw-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-05","capabilities":{},"clientInfo":{"name":"my-client","version":"1.0"}}}'

# 5. Ping
curl -X POST https://your-server.com/mcp \
  -H "Authorization: Bearer <raw-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
```

### Ejemplo en vivo

Los endpoints de health, login y tokens están verificados en vivo en
<https://sechel-server.vercel.app>.

---

## Referencia

### Admin REST API

Todas las rutas de admin se montan bajo `/admin` (configurable mediante la
opción `prefix`).

#### Autenticación

El inicio de sesión devuelve un **JWT**. Envíelo como:

```
Authorization: Bearer <jwt>
Cookie: session=<jwt>           (for web clients)
```

#### Rutas públicas (sin autenticación)

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

##### Autenticación

```bash
POST /admin/auth/login
Content-Type: application/json

{"username": "admin", "password": "admin123"}

→ 200 { "token": "<jwt>", "user": { "id": 1, "username": "admin", "role": "admin" } }
→ 401 { "error": "Invalid credentials" }
```

##### Usuarios (solo admin)

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

##### Tokens de API (solo admin)

Los tokens se generan en el servidor (no se aceptan tokens externos). Se
almacenan como SHA-256; el valor `raw` se devuelve **una vez** en la creación.

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

> **Guarde el valor `raw`** — nunca se almacena en texto plano y no se puede
> recuperar más tarde.

##### Configuración (solo admin)

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

### Endpoint MCP

```
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

#### Cómo funciona la autenticación

`verifyToken()` verifica en orden:

1. **SECHEL_DEV_TOKEN** — si el token Bearer coincide con esta variable de
   entorno, se le otorga acceso de admin de inmediato. Para desarrollo y
   configuraciones de un solo usuario.
2. **Búsqueda SHA-256 en `user_tokens`** — aplica hash al token y busca en la
   base de datos. Verifica que el usuario esté activo.

Sin token o con token inválido → `401 Unauthorized`.

> **Importante**: El endpoint MCP **NO** acepta JWTs de sesión. Use un
> **token de API** (creado mediante `POST /admin/tokens`) o
> `SECHEL_DEV_TOKEN`.

#### Encabezados requeridos

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <token>` |
| `Content-Type` | `application/json` |
| `Accept` | `application/json, text/event-stream` |

Falta de `Accept: text/event-stream` → `406 Not Acceptable`.

#### Herramientas expuestas

El servidor expone 22 herramientas `mem_*` más `ping` (idénticas a la API de
Engram):

| Tool | Description |
|------|-------------|
| `ping` | Health check |
| `mem_save` | Save observation (upsert by topic_key) |
| `mem_search` | FTS5 full-text search |
| `mem_get_observation` | Full content by ID |
| `mem_context` | Recent session context |
| `mem_timeline` | Chronological neighborhood of an observation |
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

#### Ejemplo de flujo MCP

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

### Variables de entorno

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Turso URL (`libsql://...`) or SQLite (`file:...`) |
| `DATABASE_AUTH_TOKEN` | Yes* | Turso access token |
| `TURSO_DATABASE_URL` | No | Legacy alias of `DATABASE_URL` (Turso/libSQL URL) |
| `TURSO_AUTH_TOKEN` | No | Legacy alias of `DATABASE_AUTH_TOKEN` |
| `JWT_SECRET` | Yes | JWT signing secret for admin sessions (32+ chars) |
| `ADMIN_USERNAME` | No | Initial admin username (auto-seeded on first run) |
| `ADMIN_PASSWORD` | No | Initial admin password |
| `SECHEL_DEV_TOKEN` | No | Dev token — bypasses auth for MCP endpoint |
| `TENANT_ID` | No | Tenant ID (default: `"default"`) |
| `PORT` | No | HTTP port for the Node entry (default: `3001`) |

\* No requerido para bases de datos embebidas (`file:` / `:memory:`).

`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` son alias heredados de
`DATABASE_URL` / `DATABASE_AUTH_TOKEN` — solo se necesita un par.

### Desarrollo local

```bash
pnpm -C apps/server dev        # primary dev command
# or, from the repo root: npx tsx apps/server/dev.ts
```

Esto crea `sechel-dev.db` en `apps/server/`, ejecuta las migraciones, crea el
admin por defecto e inicia en `http://localhost:3001`.

#### Puntos de entrada

- `src/index.ts` — aplicación Hono independiente del runtime (exportación por
  defecto), usada por Vercel y Cloudflare Workers.
- `src/entry-node.ts` — entrada de producción de Node.js (`npm start` /
  Docker); ejecuta `ensureSeeded()` y luego sirve en `PORT` (por defecto
  `3001`).
- `dev.ts` — entrada de desarrollo local: crea `sechel-dev.db` (SQLite), crea
  el admin y sirve en `http://localhost:3001`.

#### Credenciales de desarrollo por defecto

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |
| Dev token | `sk-dev-token` (for MCP) |

Configurables mediante variables de entorno: `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, `SECHEL_DEV_TOKEN`.

#### Pruebas

```bash
pnpm -C apps/server test        # 40 tests (admin CRUD + MCP + auth)
pnpm -C apps/server test:watch  # watch mode
```

### Despliegue

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

Vercel despliega el servidor como una función serverless mediante el preset de
framework **Hono** — la exportación por defecto en `src/index.ts` es el punto
de entrada (no se necesitan funciones `api/` ni rewrites).

**Requisitos previos**: una URL de base de datos Turso + token de
autenticación, además de `JWT_SECRET` y `TENANT_ID`.

**Configuración del proyecto en Vercel**: Root Directory = `apps/server`,
Framework Preset = **Hono**. Configure estas variables de entorno:
`DATABASE_URL` (`libsql://...`), `DATABASE_AUTH_TOKEN`, `JWT_SECRET`,
`TENANT_ID` y, opcionalmente, `ADMIN_USERNAME` / `ADMIN_PASSWORD` y
`SECHEL_DEV_TOKEN`.

**Inicialice la base de datos primero**: `ensureSeeded()` solo se ejecuta en la
entrada de Node, por lo que debe inicializar la base de datos Turso de
antemano — por ejemplo, ejecute `pnpm --filter @sechel/server start` una vez en
local con `DATABASE_URL` / `DATABASE_AUTH_TOKEN` apuntando a la base de datos
remota, o use la entrada de desarrollo / un script.

```bash
pnpm -C apps/server deploy:vercel
# or, from apps/server: vercel deploy --prod
```

### Multi-usuario con Panel

Cuando se despliega junto a `apps/panel`, la gestión de usuarios y tokens se
realiza a través de la interfaz de administración de Astro. El servidor solo
expone el endpoint MCP.

Consulte [`apps/panel/README.md`](../panel/README.md) para la guía de
despliegue completa.

### Configuración de OpenCode

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

### Licencia

MIT — consulte [LICENSE](../../LICENSE) en la raíz del repositorio.
