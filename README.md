# Sechel

Servidor MCP en la nube para memorias persistentes de agentes de IA, 100%
compatible con la API de herramientas `mem_*` de
[Engram](https://github.com/Gentleman-Programming/engram).

Los agentes (Claude Code, OpenCode, Cursor, Gemini CLI, etc.) que soporten
**MCP over HTTP** pueden apuntar a Sechel y usar las mismas herramientas
`mem_save`, `mem_search`, `mem_context`, … sin cambios. La diferencia: la memoria
vive en la nube (Turso / libSQL), no en un archivo SQLite local, y está aislada
por tenant.

---

## Por qué existe

Engram corre como binario local con SQLite de archivo y transporte **stdio**.
Eso no se despliega en Vercel (no hay stdio en serverless). Sechel es el
mismo cerebro de memoria, pero:

- **Transporte:** MCP Streamable HTTP (no stdio).
- **DB:** Turso (SQLite remoto vía libSQL) en lugar de archivo local.
- **Multi-tenant:** cada usuario tiene sus memorias aisladas por `tenant_id`.
- **Sin replicación local→cloud:** las tablas `sync_mutations` / `sync_chunks`
  de Engram no existen; la nube es la fuente de verdad.

El comportamiento de las herramientas es idéntico al de Engram (upsert por
`topic_key`, dedupe en ventana de 15 min, FTS5 + `bm25()`, conflict surfacing).
Ver [`docs/engram-query-reference.md`](docs/engram-query-reference.md) para el
SQL exacto por herramienta.

---

## Stack

- **Runtime:** Node.js, Cloudflare Workers, Deno
- **Server:** Hono (MCP Streamable HTTP)
- **Panel:** Astro + React islands + Tailwind CSS v4
- **DB:** Turso / libSQL (vía `@libsql/client`)
- **Auth:** JWT (jose), Argon2id (hash-wasm), SHA-256 tokens API
- **Package manager:** pnpm 9.15
- **Publicación:** npm (`@sechel-mcp/core`, `@sechel-mcp/mcp-server`, `@sechel-mcp/cli`)

---

## Perfiles de uso

Elegí el que se ajuste a tu caso:

| Perfil | Componente | README | Ideal para |
|--------|-----------|--------|------------|
| **Local** | `apps/cli` | [`apps/cli/README.md`](apps/cli/README.md) | Uso local con SQLite embebida, sin depender de Turso ni cloud |
| **Single-user** | `apps/server` | [`apps/server/README.md`](apps/server/README.md) | Un solo usuario, MCP endpoint remoto, sin UI de administración |
| **Multi-user** | `apps/panel` + `apps/server` | [`apps/panel/README.md`](apps/panel/README.md) | Equipos, gestión visual de usuarios y tokens |

### Local (CLI)

```bash
npx sechel
```

Sin config, sin cloud. La DB se crea automáticamente en `~/.config/sechel/`.
Conectá tu cliente MCP via stdio.

Ver [`apps/cli/README.md`](apps/cli/README.md).

### Single-user (server standalone)

Un proceso Hono que expone el endpoint MCP over HTTP. Ideal para desplegar en
Vercel, Cloudflare Workers, o Docker para uso personal.

```bash
# Configurar
export DATABASE_URL=libsql://...
export DATABASE_AUTH_TOKEN=...
export SECHEL_DEV_TOKEN=sk-my-dev-token

# Levantar
pnpm -C apps/server dev
```

Autenticación vía `Authorization: Bearer <token>`. El endpoint valida contra
`user_tokens` o `SECHEL_DEV_TOKEN`. Sin panel, sin UI.

Ver [`apps/server/README.md`](apps/server/README.md).

### Multi-user (panel + server)

El panel de Astro embebe el server Hono en el mismo proceso. Incluye:

- Login/register con JWT + HttpOnly cookies
- Dashboard con estado del sistema
- CRUD de usuarios con roles y permisos por proyecto
- Gestión de tokens de API
- Configuración de instancia en runtime

```bash
pnpm -C apps/panel dev
```

Ver [`apps/panel/README.md`](apps/panel/README.md).

---

## Estructura del monorepo

```
sechel/
├── packages/
│   ├── core/            ← @sechel-mcp/core — createDb, verifyToken, domain
│   └── mcp-server/      ← @sechel-mcp/mcp-server — createSechelServer factory
├── apps/
│   ├── cli/             ← @sechel-mcp/cli — uso local via stdio
│   ├── server/          ← @sechel/server — Hono HTTP, endpoint MCP
│   └── panel/           ← @sechel/panel — Astro admin panel
├── modules/             ← Backward-compat re-exports (legacy Next.js)
├── docs/
│   ├── engram-query-reference.md
│   └── architecture.md
└── app/                 ← Legacy Next.js app (migración en curso)
```

---

## Configuración en OpenCode

Sechel puede configurarse en OpenCode como servidor MCP remoto:

```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "https://<tu-despliegue>/mcp",
      "headers": {
        "Authorization": "Bearer <tu-token>"
      }
    }
  }
}
```

Para usar las herramientas con el prefijo `engram_` (compatible con skills
existentes), nombrá el servidor como `engram` en la config.

---

## Roadmap

- [x] Schema multi-tenant + FTS5
- [x] 24 herramientas `mem_*` implementadas
- [x] Auth real: Argon2id, JWT, SHA-256 tokens API
- [x] CLI local (`@sechel-mcp/cli`)
- [x] Server Hono con StreamableHTTP (`@sechel/server`)
- [ ] Panel multi-user completo (Astro)
- [ ] Conflict surfacing (`mem_save` → `FindCandidates` → `memory_relations`)

---

## Licencia

MIT — ver [LICENSE](LICENSE).

Sechel es un proyecto original con licencia MIT. No contiene código fuente
de Engram, pero la especificación de queries en
[`docs/engram-query-reference.md`](docs/engram-query-reference.md) está derivada
del store interno de Engram para mantener compatibilidad 100% de herramientas.

- [Engram](https://github.com/Gentleman-Programming/engram) — © 2026 Alan Buscaglia (MIT)
- [Sechel](LICENSE) — © 2026 samcasdev (MIT)
