import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { CortexDB } from './types.js';
import { normalizeProject } from './domain/normalize.js';
import { hashToken } from './tokens.js';

export interface Actor {
  userId: number;
  role: 'admin' | 'member';
  username: string;
}

export type RequiredLevel = 'read' | 'write';

function getEnv(name: string, legacyName: string): string | undefined {
  const val = process.env[name];
  if (val !== undefined && val !== '') return val;
  const legacy = process.env[legacyName];
  if (legacy !== undefined && legacy !== '') {
    console.warn(`[sechel] Using legacy env ${legacyName} — rename to ${name}`);
    return legacy;
  }
  return undefined;
}

/**
 * Verify a bearer token against the database.
 *
 * 1. If SECHEL_DEV_TOKEN (or legacy CORTEXT_DEV_TOKEN) is set and non-empty, match against it directly.
 * 2. Otherwise, compute SHA-256 of the bearer token and look up in user_tokens.
 * 3. The associated user must have is_active = 1.
 *
 * @param bearerToken - The bearer token string (undefined/missing = reject)
 * @param db - A connected Kysely instance
 * @param tenantId - The tenant ID for scoping
 * @param devTokenOverride - Optional dev token override (from env bindings like Hono's c.env)
 */
export async function verifyToken(
  bearerToken: string | undefined,
  db: Kysely<CortexDB>,
  tenantId: string,
  devTokenOverride?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  // Step 1: Dev bypass (only when SECHEL_DEV_TOKEN / CORTEXT_DEV_TOKEN is explicitly set)
  const devToken = devTokenOverride ?? getEnv('SECHEL_DEV_TOKEN', 'CORTEXT_DEV_TOKEN');
  if (devToken && devToken.length > 0 && bearerToken === devToken) {
    const res = await sql<{ id: number; role: string; username: string }>`
      SELECT id, role, username FROM users
      WHERE tenant_id = ${tenantId} AND role = 'admin'
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
      AND u.tenant_id = ${tenantId}
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

/** Extract the resolved actor from AuthInfo. */
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
  tenantId: string,
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
    WHERE tenant_id = ${tenantId}
      AND user_id = ${actor.userId}
      AND ifnull(project, '') = ifnull(${norm}, '')
    ${permFilter}
    LIMIT 1
  `.execute(db);

  return res.rows.length > 0;
}

export async function assertAuthorized(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  project: string | null | undefined,
  required: RequiredLevel,
): Promise<void> {
  const ok = await authorize(db, tenantId, actor, project, required);
  if (!ok) {
    const projectLabel = project ? `'${project}'` : '(no project)';
    throw new Error(
      `Forbidden: ${required} access to project ${projectLabel} is not granted for user '${actor.username}'`,
    );
  }
}
