import { sql, type Kysely } from 'kysely';
import type { CortexDB } from '../types';
import { assertAuthorized, type Actor } from '../auth';
import { genSyncId, getObservationById } from './store-utils';
import { normalizeProject } from './normalize';
import type { JudgeInput, CompareInput } from './validation';

export async function judgeRelation(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: JudgeInput,
): Promise<{ success: boolean }> {
  await assertAuthorized(db, tenantId, actor, null, 'write');

  const r = await sql`
    UPDATE memory_relations
    SET relation      = ${input.relation},
        reason        = ${input.reason ?? null},
        evidence      = ${input.evidence ?? null},
        confidence    = ${input.confidence ?? 1.0},
        marked_by_actor = ${actor.username},
        marked_by_kind = 'engram',
        judgment_status = 'judged',
        updated_at    = datetime('now')
    WHERE tenant_id = ${tenantId}
      AND sync_id   = ${input.judgment_id}
  `.execute(db);

  const affected = r.numAffectedRows !== undefined ? Number(r.numAffectedRows) : 0;
  if (affected === 0) {
    throw new Error(`Relation not found: ${input.judgment_id}`);
  }

  return { success: true };
}

export async function compareMemories(
  db: Kysely<CortexDB>,
  tenantId: string,
  actor: Actor,
  input: CompareInput,
): Promise<{ sync_id: string }> {
  const obsA = await getObservationById(db, tenantId, input.memory_id_a);
  if (!obsA) throw new Error(`Observation not found: ${input.memory_id_a}`);
  const obsB = await getObservationById(db, tenantId, input.memory_id_b);
  if (!obsB) throw new Error(`Observation not found: ${input.memory_id_b}`);

  const memASync = obsA.sync_id ?? '';
  const memBSync = obsB.sync_id ?? '';

  const normA = normalizeProject(obsA.project);
  const normB = normalizeProject(obsB.project);

  if (normA !== null) await assertAuthorized(db, tenantId, actor, normA, 'write');
  if (normB !== null) await assertAuthorized(db, tenantId, actor, normB, 'write');

  if (input.relation === 'not_conflict') {
    return { sync_id: '' };
  }

  const relSyncId = genSyncId('rel');
  await sql`
    INSERT INTO memory_relations
      (tenant_id, sync_id, source_id, target_id, relation, confidence, reason, marked_by_model, judgment_status)
    VALUES
      (${tenantId}, ${relSyncId}, ${memASync}, ${memBSync}, ${input.relation},
       ${input.confidence ?? 1.0}, ${input.reasoning ?? null}, ${input.model ?? null}, 'judged')
  `.execute(db);

  return { sync_id: relSyncId };
}
