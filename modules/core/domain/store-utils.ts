import 'server-only';
import { sql, type Kysely } from 'kysely';
import { createHash, randomBytes } from 'node:crypto';
import type { CortexDB, ObservationsTable } from '../db/db-types';

// ---------------------------------------------------------------------------
// Helpers replicating upstream Engram behavior (extracted from store.ts so
// store-relations.ts and store-admin.ts can use them without circular deps).
// On merge with Chunk A, these should consolidate into one store-utils.ts.
// ---------------------------------------------------------------------------

export function genSyncId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function stripPrivate(text: string): string {
  return text.replace(/<private>[\s\S]*?<\/private>/g, '');
}

export async function getObservationById(
  db: Kysely<CortexDB>,
  tenantId: string,
  id: number,
): Promise<ObservationsTable | null> {
  const r = await sql<ObservationsTable>`
    SELECT * FROM observations WHERE tenant_id = ${tenantId} AND id = ${id}
  `.execute(db);
  return r.rows[0] ?? null;
}
