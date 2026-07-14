// @sechel/core — Platform-agnostic core domain package
// No server-only imports. No Next.js dependencies. Factory-based DB creation.

export { createDb } from './db.js';
export type { DbOptions } from './db.js';

export {
  verifyToken,
  authorize,
  assertAuthorized,
  actorFromAuthInfo,
} from './auth.js';
export type { Actor, RequiredLevel } from './auth.js';

export { hashToken } from './tokens.js';

export * from './domain/index.js';

export type {
  CortexDB,
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
} from './types.js';
