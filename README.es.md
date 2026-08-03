# Sechel

Memoria persistente para agentes de IA. Desplegable en cualquier lado —
Vercel, Cloudflare Workers, Docker, o tu propio servidor.

Los agentes (Claude Code, OpenCode, Cursor, Gemini CLI, etc.) se conectan via
**MCP over HTTP** y usan herramientas como `mem_save`, `mem_search`,
`mem_context` para leer y escribir memoria que persiste entre sesiones. La
memoria vive en la nube (Turso / libSQL), aislada por tenant.

---

## Por qué existe

Los agentes de IA necesitan memoria para ser útiles más allá de una sola
conversación — pero la mayoría de las soluciones de memoria son binarios
locales que no pueden ejecutarse en plataformas serverless.

Sechel provee las mismas herramientas de memoria que tu agente ya espera,
pero como un endpoint HTTP:

- **MCP Streamable HTTP** — funciona en serverless, edge, y entornos tradicionales.
- **Base de datos en la nube** — Turso (libSQL) en lugar de un archivo SQLite local.
- **Multi-tenant** — cada usuario o equipo tiene memoria aislada por `tenant_id`.
- **Auth incluida** — sesiones JWT, contraseñas con Argon2id, tokens API con SHA-256.
- **Admin API** — gestioná usuarios, tokens y configuración en runtime.

---

## Inicio rápido

```bash
# CLI local (stdio) con un solo comando
npx sechel
```

```bash
# O ejecutá el server localmente (HTTP)
pnpm -C apps/server dev
```

```bash
# Conectá tu agente
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

Un proceso Hono que expone el endpoint MCP over HTTP + Admin REST API.
Ideal para desplegar en Vercel, Cloudflare Workers, o Docker para uso personal.

```bash
export DATABASE_URL=libsql://...
export DATABASE_AUTH_TOKEN=...
export JWT_SECRET=my-32-char-secret-string-here
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=my-strong-password
export SECHEL_DEV_TOKEN=sk-my-dev-token

pnpm -C apps/server dev
```

**MCP endpoint**: `POST /mcp` — autenticación vía `Authorization: Bearer <token>`.

**Admin REST API**: `POST /admin/auth/login` → JWT. CRUD de usuarios, tokens y
settings bajo `/admin/*`. Roles: `admin` y `member`.

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

---

## Compatibilidad

Sechel implementa la misma interfaz de herramientas `mem_*` que
[Engram](https://github.com/Gentleman-Programming/engram) — upsert por
`topic_key`, ventana de dedupe de 15 min, FTS5 + `bm25()`, conflict surfacing.

Si ya usás Engram, apuntá tu cliente a Sechel y funciona sin cambios. Nombralo
como `engram` en la config de MCP para mantener los prefijos `engram_*`
existentes.

Ver [`docs/engram-query-reference.md`](docs/engram-query-reference.md) para la
referencia SQL completa por herramienta.

---

## Roadmap

- [x] Schema multi-tenant + FTS5
- [x] 22 herramientas `mem_*` implementadas
- [x] Auth real: Argon2id, JWT, SHA-256 tokens API
- [x] CLI local (`@sechel-mcp/cli`)
- [x] Server Hono con StreamableHTTP (`@sechel/server`)
- [x] Admin REST API (JWT login, CRUD users/tokens/settings, roles)
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
