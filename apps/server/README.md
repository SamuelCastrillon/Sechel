# @sechel/server — Sechel MCP Server

Servidor MCP over HTTP (StreamableHTTP) para desplegar Sechel como endpoint remoto.

## Perfil: Single-user

Cuando desplegás `apps/server` sin el panel de Astro, tenés un MCP endpoint
para uso personal. No hay UI de administración — usás tokens de API directos.

### Cómo se asegura

El endpoint `POST /mcp` valida el token contra la DB usando `verifyToken()` de
`@sechel-mcp/core`:

```text
Authorization: Bearer <token>
```

`verifyToken()` chequea en este orden:

1. **SECHEL_DEV_TOKEN** — si es igual al valor del env var, autoriza al instante.
   Pensado para desarrollo o single-user.
2. **SHA-256 de user_tokens** — busca el hash del token en la tabla
   `user_tokens`, verifica que el usuario esté activo, y autoriza.

Si no pasás ningún token, responde `401 Unauthorized`.

### Configuración mínima (single-user)

```bash
# Obligatorias
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=your-turso-token

# Token de desarrollo — usalo como Bearer token en tu cliente MCP
SECHEL_DEV_TOKEN=sk-my-dev-token

# Seed del admin (opcional, necesario si después querés gestionar usuarios)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password
JWT_SECRET=32-char-random-string
```

### Uso

```bash
pnpm -C apps/server dev
```

El endpoint queda en `http://localhost:3001/mcp`.

Ejemplo de conexión desde OpenCode:

```json
{
  "mcp": {
    "sechel": {
      "type": "remote",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer sk-my-dev-token"
      }
    }
  }
}
```

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | URL de Turso (libsql://... o file:...) |
| `DATABASE_AUTH_TOKEN` | Sí* | Token de acceso a Turso |
| `SECHEL_DEV_TOKEN` | No | Token de desarrollo — bypass de auth |
| `ADMIN_USERNAME` | No | Admin inicial (seed al arrancar) |
| `ADMIN_PASSWORD` | No | Password del admin inicial |
| `JWT_SECRET` | No | Para sesiones del panel (32+ chars) |
| `TENANT_ID` | No | Tenant ID (default: "default") |

\* No obligatoria para DBs embebidas (file:/:memory:).

## Perfil: Multi-user

Cuando el server se despliega junto con `apps/panel`, la gestión de usuarios
y tokens se hace desde el panel. El server solo expone el endpoint MCP.

Ver [`apps/panel/README.md`](../panel/README.md) para el deploy completo.

## Despliegue standalone

### Docker

```bash
docker build -t sechel-server -f apps/server/Dockerfile .
docker run -e DATABASE_URL=... -e DATABASE_AUTH_TOKEN=... -e SECHEL_DEV_TOKEN=sk-my-token -p 3001:3001 sechel-server
```

### Cloudflare Workers

```bash
pnpm -C apps/server deploy:cf
```

### Vercel

```bash
pnpm -C apps/server deploy:vercel
```

## Licencia

MIT — see [LICENSE](../../LICENSE) en la raíz del repo.
