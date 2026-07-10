'use server';

import { type Client } from '@libsql/client';
import { TENANT_ID } from '@/modules/core/db';
import { withAdmin } from '@/modules/panel/auth';
import { generateApiToken } from '@/modules/core/auth/tokens';
import type { ActionResult } from '@/modules/panel/auth';

// ── Internal helpers (exported for testability) ──────────────────

export async function listTokensInternal(client: Client, tenantId: string): Promise<unknown[]> {
  const result = await client.execute({
    sql: `SELECT id, prefix, description, created_at
          FROM user_tokens WHERE tenant_id = ? ORDER BY created_at DESC`,
    args: [tenantId],
  });
  return result.rows.map((r) => ({ ...r }));
}

export interface CreateTokenResult {
  raw: string;
  prefix: string;
  description: string;
}

export async function createTokenInternal(
  client: Client,
  tenantId: string,
  userId: number,
  description: string,
): Promise<CreateTokenResult> {
  const token = generateApiToken();

  await client.execute({
    sql: `INSERT INTO user_tokens (tenant_id, user_id, prefix, token_hash, description, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    args: [tenantId, userId, token.prefix, token.hash, description],
  });

  return {
    raw: token.raw,
    prefix: token.prefix,
    description,
  };
}

export async function revokeTokenInternal(client: Client, tokenId: number): Promise<void> {
  await client.execute({
    sql: `DELETE FROM user_tokens WHERE id = ?`,
    args: [tokenId],
  });
}

// ── Server Actions ───────────────────────────────────────────────

export async function listTokens(): Promise<ActionResult> {
  return withAdmin((client) => listTokensInternal(client, TENANT_ID()));
}

export async function createToken(description: string): Promise<ActionResult> {
  return withAdmin((client, userId) =>
    createTokenInternal(client, TENANT_ID(), userId, description),
  );
}

export async function revokeToken(tokenId: number): Promise<ActionResult> {
  return withAdmin((client) => revokeTokenInternal(client, tokenId));
}
