// @sechel/core — Platform-agnostic core domain package
// No server-only imports. No Next.js dependencies. Factory-based DB creation.

export { createDb } from './db';
export type { DbOptions } from './db';

export {
  verifyToken,
  authorize,
  assertAuthorized,
  actorFromAuthInfo,
} from './auth';
export type { Actor, RequiredLevel } from './auth';

export { generateApiToken, hashToken } from './tokens';
export { hashPassword, verifyPassword } from './password';

export * from './domain';

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
} from './types';
