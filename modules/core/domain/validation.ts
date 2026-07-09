import { z } from 'zod';

// Zod validates tool INPUT at the MCP boundary (Kysely types the rows).
export const saveSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: z.string().default('manual'),
  project: z.string().nullable().optional(),
  scope: z.string().default('project'),
  topic_key: z.string().nullable().optional(),
  tool_name: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  sync_id: z.string().nullable().optional(),
  review_after: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

export const searchSchema = z.object({
  query: z.string().min(1),
  type: z.string().optional(),
  project: z.string().nullable().optional(),
  scope: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  match_mode: z.enum(['all', 'any']).default('all'),
});

// ---------------------------------------------------------------------------
// P1 — Lectura simple
// ---------------------------------------------------------------------------

export const getObservationSchema = z.object({
  id: z.number().int().positive(),
});
export type GetObservationInput = z.input<typeof getObservationSchema>;

export const statsSchema = z.object({});
export type StatsInput = z.input<typeof statsSchema>;

export const currentProjectSchema = z.object({
  project: z.string().nullable().optional(),
});
export type CurrentProjectInput = z.input<typeof currentProjectSchema>;

export const suggestTopicKeySchema = z.object({
  title: z.string().min(1),
  type: z.string().optional(),
});
export type SuggestTopicKeyInput = z.input<typeof suggestTopicKeySchema>;

// ---------------------------------------------------------------------------
// P2 — Escritura simple
// ---------------------------------------------------------------------------

export const pinSchema = z.object({
  id: z.number().int().positive(),
});
export type PinInput = z.input<typeof pinSchema>;

export const savePromptSchema = z.object({
  content: z.string().min(1),
  session_id: z.string().min(1),
  project: z.string().nullable().optional(),
  sync_id: z.string().nullable().optional(),
});
export type SavePromptInput = z.input<typeof savePromptSchema>;

export const sessionStartSchema = z.object({
  id: z.string().min(1),
  project: z.string().min(1),
  directory: z.string().optional().default('unknown'),
});
export type SessionStartInput = z.input<typeof sessionStartSchema>;

export const sessionEndSchema = z.object({
  id: z.string().min(1),
  summary: z.string().nullable().optional(),
});
export type SessionEndInput = z.input<typeof sessionEndSchema>;

export type SaveInput = z.input<typeof saveSchema>;
export type SearchInput = z.input<typeof searchSchema>;

// ---------------------------------------------------------------------------
// P3 — Escritura media
// ---------------------------------------------------------------------------

export const updateSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.string().optional(),
  project: z.string().nullable().optional(),
  scope: z.string().optional(),
  topic_key: z.string().nullable().optional(),
  tool_name: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  sync_id: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  review_after: z.string().nullable().optional(),
});
export type UpdateInput = z.input<typeof updateSchema>;

export const deleteSchema = z.object({
  id: z.number().int().positive(),
  hard_delete: z.boolean().optional().default(false),
});
export type DeleteInput = z.input<typeof deleteSchema>;

// ---------------------------------------------------------------------------
// P4 — Consultas multi-query
// ---------------------------------------------------------------------------

export const timelineSchema = z.object({
  focus_id: z.number().int().positive(),
  before: z.number().int().min(1).max(100).optional().default(10),
  after: z.number().int().min(1).max(100).optional().default(10),
});
export type TimelineInput = z.input<typeof timelineSchema>;

export const contextSchema = z.object({
  project: z.string().nullable().optional(),
  scope: z.string().optional(),
  max_context: z.number().int().min(1).max(100).optional().default(50),
});
export type ContextInput = z.input<typeof contextSchema>;

// ---------------------------------------------------------------------------
// P5 — Juicio
// ---------------------------------------------------------------------------

export const judgeSchema = z.object({
  judgment_id: z.string().min(1),
  relation: z.enum(['related', 'compatible', 'scoped', 'conflicts_with', 'supersedes', 'not_conflict']),
  reason: z.string().optional(),
  evidence: z.string().optional(),
  confidence: z.number().min(0).max(1).optional().default(1.0),
});
export type JudgeInput = z.input<typeof judgeSchema>;

export const compareSchema = z.object({
  memory_id_a: z.number().int().positive(),
  memory_id_b: z.number().int().positive(),
  relation: z.enum(['related', 'compatible', 'scoped', 'conflicts_with', 'supersedes', 'not_conflict']),
  confidence: z.number().min(0).max(1).optional().default(1.0),
  reasoning: z.string().max(200).optional(),
  model: z.string().optional(),
});
export type CompareInput = z.input<typeof compareSchema>;

// ---------------------------------------------------------------------------
// P6 — Administrativos
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({
  action: z.enum(['list', 'mark_reviewed']),
  id: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional().default(10),
  project: z.string().nullable().optional(),
});
export type ReviewInput = z.input<typeof reviewSchema>;

export const doctorSchema = z.object({
  check: z.string().optional(),
  project: z.string().nullable().optional(),
});
export type DoctorInput = z.input<typeof doctorSchema>;

export const mergeProjectsSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type MergeProjectsInput = z.input<typeof mergeProjectsSchema>;

export const capturePassiveSchema = z.object({
  content: z.string().min(1),
  session_id: z.string().optional(),
  project: z.string().nullable().optional(),
  source: z.string().optional(),
});
export type CapturePassiveInput = z.input<typeof capturePassiveSchema>;
