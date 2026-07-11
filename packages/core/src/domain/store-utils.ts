import { sql, type Kysely } from 'kysely';
import { createHash, randomBytes } from 'node:crypto';
import type { CortexDB, ObservationsTable } from '../types';

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
