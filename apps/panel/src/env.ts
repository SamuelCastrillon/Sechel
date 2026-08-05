import { z } from 'zod';

// Accepted DATABASE_URL schemes: Turso/libSQL remote (libsql://, https://),
// local SQLite file (file:), or in-memory (:memory:).
const databaseUrlSchema = z
  .string()
  .refine(
    (v) =>
      v.startsWith('libsql://') ||
      v.startsWith('https://') ||
      v.startsWith('file:') ||
      v.startsWith(':memory:'),
    {
      message:
        'DATABASE_URL must start with libsql://, https://, file:, or :memory:',
    },
  );

const panelEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  DATABASE_AUTH_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  ADMIN_USERNAME: z.string().optional().default('admin'),
  ADMIN_PASSWORD: z.string().optional(),
  TENANT_ID: z.string().optional().default('default'),
  PORT: z.string().optional().default('3000'),
});

export type Env = z.infer<typeof panelEnvSchema>;

export function parsePanelEnv(env: Record<string, string | undefined>): Env {
  const result = panelEnvSchema.safeParse(env);
  if (!result.success) {
    console.error('[panel/env] Invalid environment:', result.error.flatten());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}

/** @deprecated use parsePanelEnv */
export const parseEnv = parsePanelEnv;
