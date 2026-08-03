# @sechel-mcp/core

Platform-agnostic core package for Sechel — factory-based database creation, authentication, token management, and domain stores for AI agent persistent memory.

## Install

```bash
npm i @sechel-mcp/core
```

## Quick Start

```ts
import { createDb } from '@sechel-mcp/core';

// In-memory (testing)
const db = await createDb({ url: ':memory:' });

// Local SQLite file
const db = await createDb({ url: 'file:./data.db' });

// Turso remote
const db = await createDb({
  url: 'libsql://db.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

## API Reference

### `createDb(options: DbOptions): Promise<Kysely<CortexDB>>`

Creates a connected Kysely instance with automatic schema migrations.

| Option | Type | Description |
|---|---|---|
| `url` | `string` | Database URL (`:memory:`, `file:...`, `libsql://...`) |
| `authToken` | `string?` | Auth token for Turso remote databases |
| `runtime` | `'node' \| 'edge' \| 'auto'?` | Runtime detection mode (default: `'auto'`) |
| `tenantId` | `string?` | Tenant ID override |

```ts
const db = await createDb({ url: 'file:./sechel.db' });
const row = await db
  .selectFrom('observations')
  .selectAll()
  .where('session_id', '=', sessionId)
  .execute();
```

### `verifyToken(bearerToken, db, tenantId): Promise<AuthInfo | undefined>`

Verifies a bearer token against the `user_tokens` table. Supports a `SECHEL_DEV_TOKEN` bypass for development.

```ts
import { verifyToken } from '@sechel-mcp/core';

const authInfo = await verifyToken('sk_abc123...', db, 'default');
if (!authInfo) throw new Error('Unauthorized');
```

### `authorize(db, tenantId, actor, project, requiredLevel): Promise<boolean>`

Per-project authorization guard. Admins have access to all projects; members require a `user_project_access` row with the needed permission level.

```ts
import { authorize, actorFromAuthInfo } from '@sechel-mcp/core';

const actor = actorFromAuthInfo(authInfo);
const allowed = await authorize(db, tenantId, actor!, 'my-project', 'read');
```

### `assertAuthorized(db, tenantId, actor, project, requiredLevel): Promise<void>`

Same as `authorize` but throws `Forbidden` instead of returning false.

### `actorFromAuthInfo(authInfo?: AuthInfo): Actor | undefined`

Extracts the `Actor` (`{ userId, role, username }`) from SDK `AuthInfo`.

### Token & Password Utilities

```ts
import { generateApiToken, hashToken } from '@sechel-mcp/core';

const { raw, hash, prefix } = generateApiToken();
// raw:   80-char hex string (store this once)
// hash:  SHA-256 hex (store in user_tokens.token_hash)
// prefix: "sk_abc1234" (display purpose only)

const lookup = hashToken(raw);
// Same SHA-256 hex — use to look up in user_tokens
```

```ts
import { hashPassword, verifyPassword } from '@sechel-mcp/core';

const encoded = await hashPassword('s3cret');
const valid = await verifyPassword('s3cret', encoded); // true
```

### Domain Stores

All domain stores and utilities are re-exported from `@sechel-mcp/core`:

`mem_save`, `mem_search`, `mem_get_observation`, `mem_context`, `mem_timeline`, `mem_update`, `mem_delete`, `mem_pin`, `mem_unpin`, `mem_suggest_topic_key`, `mem_compare`, `mem_judge`, `mem_stats`, `mem_doctor`, `mem_review`, `mem_session_start`, `mem_session_end`, `mem_session_summary`, `mem_capture_passive`, `mem_save_prompt`, `mem_current_project`, `mem_merge_projects`, `ping`, `runMigrations`, `seedExampleData`, `normalizeProject`, and domain type validators.

### Types

```ts
import type {
  CortexDB,
  DbOptions,
  Actor,
  RequiredLevel,
  SessionsTable,
  ObservationsTable,
  UserPromptsTable,
  MemoryRelationsTable,
  UserTokensTable,
  InstanceSettingsTable,
  UsersTable,
  ProjectsTable,
  UserProjectAccessTable,
  ObservationRow,
  UserRow,
} from '@sechel-mcp/core';
```

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
