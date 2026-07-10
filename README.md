# CortextMCP

Servidor MCP en la nube para memorias persistentes de agentes de IA, 100%
compatible con la API de herramientas `mem_*` de
[Engram](https://github.com/Gentleman-Programming/engram).

Los agentes (Claude Code, OpenCode, Cursor, Gemini CLI, etc.) que soporten
**MCP over HTTP** pueden apuntar a CortextMCP y usar las mismas herramientas
`mem_save`, `mem_search`, `mem_context`, … sin cambios. La diferencia: la memoria
vive en la nube (Turso / libSQL), no en un archivo SQLite local, y está aislada
por tenant.

---

## Por qué existe

Engram corre como binario local con SQLite de archivo y transporte **stdio**.
Eso no se despliega en Vercel (no hay stdio en serverless). CortextMCP es el
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

- **Next.js 15** (App Router) + React 19
- [`mcp-handler`](https://www.npmjs.com/package/mcp-handler) — servidor MCP over
  HTTP (Streamable HTTP + OAuth resource metadata)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- **Turso** (`@libsql/client`) como base de datos
- **Zod** para validación de esquemas de herramientas

---

## Estado actual

> ⚠️ **Proyecto en bootstrap.** La infraestructura MCP y la conexión a Turso
> están cableadas, pero la lógica de negocio aún no. Lo implementado:

| Componente            | Estado                                   |
| --------------------- | ---------------------------------------- |
| Handler MCP (`/api/mcp`) | ✅ vivo (hoy solo expone `ping`)      |
| Auth (bearer/OAuth)   | 🟡 stub — `verifyToken` acepta cualquier token y devuelve `userId: 'stub'` |
| Cliente Turso         | ✅ lazy client listo (`lib/db.ts`)       |
| Schema de memorias    | ❌ pendiente (marcado como TODO)         |
| 20 herramientas `mem_*` | ❌ pendiente (solo `ping` por ahora)   |
| Admin / login         | 🟡 páginas base creadas (`/admin`)       |

La referencia de queries ya está documentada y es la especificación que las
herramientas deben cumplir: `docs/engram-query-reference.md`.

---

## Setup local

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar entorno
cp .env.example .env.local
#   TURSO_URL      — URL de tu base Turso (ej. https://<org>-<db>.turso.io)
#   TURSO_TOKEN    — token de acceso de Turso
#   AUTH_ISSUER_URL — issuer OAuth (stub por ahora)
#   MCP_REQUIRED_SCOPES — scopes requeridos (default: read:memories)

# 3. Levantar en dev
pnpm dev
```

El endpoint MCP queda en `http://localhost:3000/api/mcp`.

### Variables de entorno

| Variable              | Descripción                                       |
| --------------------- | ------------------------------------------------- |
| `TURSO_URL`           | URL de la base Turso (obligatoria)                |
| `TURSO_TOKEN`         | Token de acceso de Turso                          |
| `AUTH_ISSUER_URL`     | Issuer OAuth para metadata de recurso protegido   |
| `MCP_REQUIRED_SCOPES` | Scopes que el token debe tener (default `read:memories`) |

---

## Despliegue en Vercel

1. Conectá el repo en Vercel.
2. Configurá las mismas variables de entorno (`TURSO_URL`, `TURSO_TOKEN`, …).
3. El build es `next build`; el runtime maneja `/api/mcp` como función serverless.

No se requiere stdin/stdio: los agentes se conectan por HTTP al endpoint
`/api/mcp`.

---

## Configuración en OpenCode

CortextMCP puede configurarse de dos formas en OpenCode, según lo que necesites.

### Modo Engram-compatible (reemplazo directo)

Las herramientas `mem_*` de Engram se llaman con prefijo `engram_` (ej.
`engram_mem_save`). Para que los agentes usen CortextMCP sin cambiar ni una línea
de código, reemplazá el servidor `engram` en la **configuración global**
(`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "engram": {
      "type": "remote",
      "url": "https://<tu-despliegue>.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <tu-token>"
      }
    }
  }
}
```

Los agentes siguen llamando a `engram_mem_save`, `engram_mem_search`, etc. —
CortextMCP responde en el mismo formato que Engram. No se necesita cambiar nada
en las instrucciones de los agentes ni en skills existentes.

### Modo servidor separado (Cortext como MCP aparte)

Si querés tener **Engram local** y **CortextMCP** como dos servidores distintos
(por ejemplo durante una migración), agregalo con otro nombre en cualquier
`opencode.json` (proyecto o global):

```json
{
  "mcp": {
    "cortext": {
      "type": "remote",
      "url": "https://<tu-despliegue>.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <tu-token>"
      }
    }
  }
}
```

En este modo los agentes ven las herramientas con prefijo `cortext_` en lugar de
`engram_` (`cortext_mem_save`, `cortext_mem_search`, …). Necesitás indicarles
explícitamente que usen ese nombre en lugar del original.

### Global vs. proyecto

| Configuración | Dónde | Efecto |
|---|---|---|
| Global | `~/.config/opencode/opencode.json` | Afecta a todos los proyectos |
| Proyecto | `<proyecto>/opencode.json` | Solo afecta a ese proyecto (se mergea con la global) |

OpenCode mergea ambas configuraciones: lo que pongas en la global aplica a todos
los proyectos, y podés overridear por proyecto si es necesario.

> **Migrar desde Engram local:** mantené Engram y CortextMCP como dos MCP
> separados en la misma sesión del agente, y pedile que copie las memorias que
> quieras conservando el mismo `topic_key` y `type`. No hay import masivo: la
> propia API `mem_*` es el camino de migración. Ver sección "Migración" en
> `docs/engram-query-reference.md`.

---

## Estructura

```
app/
  api/mcp/route.ts              # Handler MCP over HTTP (Streamable HTTP + OAuth)
  .well-known/
    oauth-protected-resource/   # Metadata de recurso protegido (MCP auth)
  admin/                        # UI de administración (base)
lib/
  auth.ts                       # verifyToken (stub por ahora)
  db.ts                         # Cliente Turso lazy
docs/
  engram-query-reference.md     # SQL por herramienta (spec de compatibilidad)
```

---

## Roadmap

- [ ] Definir schema multi-tenant en Turso (`tenant_id` en `observations`,
      `sessions`, `user_prompts`, `memory_relations`) + triggers FTS5.
- [ ] Implementar las 20 herramientas `mem_*` según `engram-query-reference.md`.
- [ ] Auth real: validar bearer contra la tabla de usuarios/tokens en Turso.
- [ ] Resolución de `project` explícita (no por cwd) + tenant por token.
- [ ] Conflict surfacing (`mem_save` → `FindCandidates` → `memory_relations`).

---

## Atribución y licencia

CortextMCP es un proyecto original con licencia **MIT**. No contiene código fuente
de Engram, pero la especificación de queries en
[`docs/engram-query-reference.md`](docs/engram-query-reference.md) está derivada
del store interno de Engram para mantener compatibilidad 100% de herramientas.

- [Engram](https://github.com/Gentleman-Programming/engram) — © 2026 Alan Buscaglia (MIT)
- [CortextMCP](LICENSE) — © 2026 samcasdev (MIT)

### Referencia

- API de herramientas y queries: [`docs/engram-query-reference.md`](docs/engram-query-reference.md)
