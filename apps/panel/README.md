# @sechel/panel — Sechel Admin Panel

Panel administrativo para Sechel MCP, construido con Astro + React islands.
Depende de `@sechel/server` (Hono) como backend embebido para servir la API y el endpoint MCP.

## Estructura de directorios

```
apps/panel/
├── public/                    ← assets estáticos (favicon, opengraph, etc.)
├── src/
│   ├── env.ts                 ← validación de variables de entorno con zod
│   │
│   ├── server/
│   │   └── index.ts           ← monta @sechel/server (createApp) como endpoint
│   │                            en la ruta /api/* dentro de Astro
│   │
│   ├── layouts/
│   │   ├── AdminLayout.astro  ← layout principal del panel: sidebar + header + slot
│   │   └── AuthLayout.astro   ← layout mínimo para login/register (sin sidebar)
│   │
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── login.astro        ← login page
│   │   │   ├── register.astro     ← register page
│   │   │   ├── index.astro        ← dashboard (resumen del sistema)
│   │   │   ├── memories.astro     ← visualización de memorias
│   │   │   ├── settings.astro     ← configuración de instancia
│   │   │   ├── users/
│   │   │   │   ├── index.astro    ← listado de usuarios
│   │   │   │   └── [id].astro     ← detalle de usuario + permisos
│   │   │   └── api-tokens.astro   ← gestión de tokens de API
│   │   └── ...                    ← landing page pública, etc.
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx          ← formulario de inicio de sesión (React island)
│   │   │   └── RegisterForm.tsx       ← formulario de registro (React island)
│   │   ├── users/
│   │   │   ├── UsersList.tsx          ← tabla de usuarios con toggle activo/rol
│   │   │   ├── UserForm.tsx           ← creación de usuario (React island)
│   │   │   └── UserPermissionsClient.tsx ← gestión de permisos por proyecto (React island)
│   │   ├── tokens/
│   │   │   └── ApiTokensList.tsx      ← CRUD de tokens de API (React island)
│   │   ├── settings/
│   │   │   ├── SettingsForm.tsx       ← edición de settings de instancia (React island)
│   │   │   └── ChangePasswordForm.tsx ← cambio de contraseña (React island)
│   │   └── ui/                        ← primitivos de UI reutilizables
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Input.tsx
│   │       ├── Label.tsx
│   │       └── Switch.tsx
│   │
│   ├── lib/
│   │   ├── api-client.ts         ← fetch wrapper tipado hacia @sechel/server (/api/*)
│   │   ├── session.ts            ← helpers de cookie + JWT (sin server-only)
│   │   └── types.ts              ← tipos compartidos (User, ApiToken, ActionResult, etc.)
│   │
│   └── styles/
│       └── global.css            ← estilos globales + Tailwind v4 directives
│
├── __tests__/
│   ├── auth.test.ts              ← JWT create/verify, login flow contra DB real
│   ├── users.test.ts             ← CRUD de usuarios contra DB real en memoria
│   ├── api-client.test.ts        ← fetch wrapper mockeado
│   └── session.test.ts           ← cookie parse/verify/guard
│
├── package.json                  ← @sechel/panel
├── tsconfig.json
├── vitest.config.ts
├── astro.config.ts
├── Dockerfile
└── .env.example
```

## Flujo de datos

```
Usuario → Astro page (.astro)
           ├── server-side: fetch() a /api/admin/* (Hono embebido)
           └── client-side: React island → fetch() a /api/admin/* con cookie de sesión

@sechel/server (Hono) → DB (Turso/libSQL)
           ├── POST /api/admin/auth/login    → login, setea cookie HttpOnly
           ├── GET  /api/admin/users         → listar usuarios
           ├── POST /api/admin/users         → crear usuario
           ├── PATCH /api/admin/users/:id    → actualizar rol/activo
           ├── GET  /api/admin/settings      → obtener settings
           ├── PATCH /api/admin/settings     → actualizar settings
           ├── GET  /api/admin/tokens        → listar tokens
           ├── POST /api/admin/tokens        → crear token
           ├── DELETE /api/admin/tokens/:id  → revocar token
           └── POST /mcp                     → MCP endpoint (Bearer token)
```

## Dependencias clave

| Paquete | Rol |
|---|---|
| `astro` | Framework de construcción de páginas |
| `@astrojs/react` | Soporte de React islands |
| `@astrojs/node` | Deploy en Node.js |
| `tailwindcss` | Estilos CSS utilitarios |
| `@sechel/server` (workspace) | Backend Hono embebido (API + MCP) |
| `@sechel-mcp/core` (workspace) | Lógica de dominio compartida |
| `jose` | JWT (sesiones de panel) |
| `zod` | Validación de env vars y formularios |

## Testing

Tests de integración acotados contra libSQL en modo archivo temporal.
Sin mocking excesivo — se prueba contra DB real.

Ver `__tests__/` para ejemplos.
