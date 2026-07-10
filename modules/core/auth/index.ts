import 'server-only';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { CortexDB } from '../db/db-types';
import { getDb, TENANT_ID } from '../db';
import { normalizeProject } from '../domain/normalize';
import { hashToken } from './tokens';

export interface Actor {
  userId: number;
  role: 'admin' | 'member';
  username: string;
}

export type RequiredLevel = 'read' | 'write';

/**
 * Verify a bearer token.
 *
 * 1. If CORTEXT_DEV_TOKEN is explicitly set and non-empty, match against it directly.
 * 2. Otherwise, compute SHA-256 of the bearer token and look up in user_tokens.
 * 3. The associated user must have is_active = 1.
 *
 * @param _req - HTTP request (unused by this implementation)
 * @param bearerToken - The bearer token string
 * @param testDb - Optional Kysely instance for testing (avoids global singleton)
 */
export async function verifyToken(
  _req: Request,
  bearerToken?: string,
  testDb?: Kysely<CortexDB>,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const db = testDb ?? await getDb();

  // Step 1: Dev bypass (only when CORTEXT_DEV_TOKEN is explicitly set to non-empty)
  const devToken = process.env.CORTEXT_DEV_TOKEN;
  if (devToken && devToken.length > 0 && bearerToken === devToken) {
    const res = await sql<{ id: number; role: string; username: string }>`
      SELECT id, role, username FROM users
      WHERE tenant_id = ${TENANT_ID()} AND role = 'admin'
      ORDER BY username ASC LIMIT 1
    `.execute(db);

    if (res.rows.length > 0) {
      const u = res.rows[0];
      return {
        token: bearerToken,
        scopes: ['read:memories', 'write:memories'],
        clientId: 'dev',
        extra: { userId: u.id, role: u.role, username: u.username },
      };
    }
    return undefined;
  }

  // Step 2: SHA-256 hash lookup in user_tokens
  const tokenHash = hashToken(bearerToken);

  const res = await sql<{
    user_id: number;
    role: string;
    username: string;
    is_active: number;
  }>`
    SELECT u.id AS user_id, u.role, u.username, u.is_active
    FROM user_tokens t
    JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id
    WHERE t.token_hash = ${tokenHash}
      AND u.tenant_id = ${TENANT_ID()}
    LIMIT 1
  `.execute(db);

  if (res.rows.length === 0) return undefined;
  const row = res.rows[0];

  if (!row.is_active) return undefined;

  const scopes: string[] = ['read:memories'];
  if (row.role === 'admin') {
    scopes.push('write:memories');
  }

  return {
    token: bearerToken,
    scopes,
    clientId: String(row.user_id),
    extra: { userId: row.user_id, role: row.role, username: row.username },
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
