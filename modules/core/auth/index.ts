import 'server-only';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { CortexDB } from '../db/db-types';
import { getDb, TENANT_ID } from '../db';
import { DEV_ADMIN_USERNAME, DEV_ADMIN_CREDENTIAL_HASH } from '../db/seed';
import { normalizeProject } from '../domain/normalize';

export interface Actor {
  userId: number;
  role: 'admin' | 'member';
  username: string;
}

export type RequiredLevel = 'read' | 'write';

/**
 * SLICE 1 DEV BYPASS — documented, NOT a silent no-op.
 *
 * Real bearer-token -> users resolution is Slice 3. For Slice 1, exactly ONE
 * dev token (CORTEXT_DEV_TOKEN, default 'dev-admin-token') is mapped to the
 * seeded admin account. ANY other token (or none) is rejected (returns
 * undefined -> 401). This makes the server usable and lets parity tests pass
 * without faking auth. It will be replaced by real auth in Slice 3.
 */
const DEV_TOKEN = process.env.CORTEXT_DEV_TOKEN ?? 'dev-admin-token';

export async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken || bearerToken !== DEV_TOKEN) return undefined;

  const db = await getDb();
  const res = await sql<{ id: number; role: string; username: string }>`
    SELECT id, role, username FROM users
    WHERE tenant_id = ${TENANT_ID()} AND username = ${DEV_ADMIN_USERNAME} AND role = 'admin'
    LIMIT 1
  `.execute(db);

  if (res.rows.length === 0) return undefined;

  const u = res.rows[0];
  return {
    token: bearerToken,
    scopes: ['read:memories', 'write:memories'],
    clientId: 'dev',
    extra: { userId: u.id, role: u.role, username: u.username },
  };
}

/** Extract the resolved actor from the MCP request's verified AuthInfo. */
export function actorFromAuthInfo(authInfo?: AuthInfo): Actor | undefined {
  const extra = authInfo?.extra as
    | { userId?: number; role?: 'admin' | 'member'; username?: string }
    | undefined;
  if (!extra?.userId) return undefined;
  return {
    userId: extra.userId,
    role: extra.role ?? 'member',
    username: extra.username ?? 'unknown',
  };
}

/**
 * Real per-project authorization guard.
 * - `admin` role => access to ALL projects.
 * - `member` => requires a `user_project_access` row for (tenant, user, project)
 *   with the needed level: 'read' allows read; 'write'/'admin' allows write.
 */
export async function authorize(
  db: Kysely<CortexDB>,
  actor: Actor,
  project: string | null | undefined,
  required: RequiredLevel,
): Promise<boolean> {
  if (actor.role === 'admin') return true;

  const norm = normalizeProject(project);
  const permFilter =
    required === 'read'
      ? sql`AND (permission = 'read' OR permission = 'write' OR permission = 'admin')`
      : sql`AND (permission = 'write' OR permission = 'admin')`;

  const res = await sql<{ c: number }>`
    SELECT 1 AS c FROM user_project_access
    WHERE tenant_id = ${TENANT_ID()}
      AND user_id = ${actor.userId}
      AND ifnull(project, '') = ifnull(${norm}, '')
    ${permFilter}
    LIMIT 1
  `.execute(db);

  return res.rows.length > 0;
}

export async function assertAuthorized(
  db: Kysely<CortexDB>,
  actor: Actor,
  project: string | null | undefined,
  required: RequiredLevel,
): Promise<void> {
  const ok = await authorize(db, actor, project, required);
  if (!ok) {
    const projectLabel = project ? `'${project}'` : '(no project)';
    throw new Error(
      `Forbidden: ${required} access to project ${projectLabel} is not granted for user '${actor.username}'`,
    );
  }
}

export { DEV_ADMIN_USERNAME, DEV_ADMIN_CREDENTIAL_HASH };
