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

export type SaveInput = z.input<typeof saveSchema>;
export type SearchInput = z.input<typeof searchSchema>;
