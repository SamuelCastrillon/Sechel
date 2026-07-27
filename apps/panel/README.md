# @sechel/panel — Sechel Admin Panel

Panel administrativo para Sechel MCP, construido con Astro + React islands.
Para equipos que necesitan gestionar usuarios, tokens de API y configuración
de instancia desde una interfaz visual.

## Perfil: Multi-user

Usá el panel cuando necesites:

- Gestión visual de usuarios (crear, desactivar, cambiar roles)
- Creación y revocación de tokens de API
- Configuración de instancia (registration_enabled, etc.)
- Dashboard con estado del sistema

El panel embebe `@sechel/server` (Hono) para servir el endpoint MCP en el
mismo proceso — no necesitás levantar un server aparte.

## Requisitos

- Base de datos Turso/libSQL
- Variables de entorno configuradas (ver `.env.example`)

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de Turso (libsql://...) |
| `DATABASE_AUTH_TOKEN` | Token de acceso a Turso |
| `JWT_SECRET` | Secreto para firmar JWTs de sesión (32+ chars) |
| `ADMIN_USERNAME` | Admin inicial (seed automático) |
| `ADMIN_PASSWORD` | Password del admin inicial |
| `TENANT_ID` | Tenant ID (default: "default") |

## Desarrollo

```bash
pnpm -C apps/panel dev
```

El panel queda en `http://localhost:3000` y el endpoint MCP en
`POST /mcp`.

## Build y deploy

```bash
# Desarrollo (Node standalone)
pnpm -C apps/panel build
pnpm -C apps/panel start

# Vercel
pnpm -C apps/panel build:vercel

# Cloudflare Workers
pnpm -C apps/panel build:cloudflare

# Docker
pnpm -C apps/panel build:docker
```

## Estructura

```
apps/panel/
├── src/
│   ├── server/index.ts         ← monta @sechel/server (Hono) para el endpoint MCP
│   ├── layouts/
│   │   ├── AdminLayout.astro   ← sidebar + header + slot
│   │   └── AuthLayout.astro    ← layout mínimo (login/register)
│   ├── pages/admin/
│   │   ├── login.astro         ← inicio de sesión
│   │   ├── register.astro      ← registro (gated por setting)
│   │   ├── index.astro         ← dashboard
│   │   ├── memories.astro      ← visualización de memorias
│   │   ├── settings.astro      ← configuración de instancia
│   │   ├── users/              ← CRUD de usuarios
│   │   └── api-tokens.astro    ← gestión de tokens
│   ├── components/
│   │   ├── auth/               ← LoginForm, RegisterForm
│   │   ├── users/              ← UsersList, UserForm, UserPermissions
│   │   ├── tokens/             ← ApiTokensList
│   │   ├── settings/           ← SettingsForm, ChangePasswordForm
│   │   └── ui/                 ← Button, Card, Input, Switch, etc.
│   ├── lib/
│   │   ├── api-client.ts       ← fetch wrapper para /api/admin/*
│   │   ├── session.ts          ← helpers de cookie + JWT
│   │   └── types.ts            ← tipos compartidos
│   └── styles/global.css       ← Tailwind v4 + tema cyber-brutalist
├── __tests__/
└── Dockerfile
```

## Testing

```bash
pnpm -C apps/panel test
```

Tests de integración contra libSQL en modo archivo temporal.
Sin mocking excesivo — se prueba contra DB real.

## Licencia

MIT — see [LICENSE](../../LICENSE) en la raíz del repo.
