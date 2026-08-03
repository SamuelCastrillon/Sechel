import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  ADMIN_USERNAME: z.string().optional().default('admin'),
  ADMIN_PASSWORD: z.string().optional(),
  TENANT_ID: z.string().optional().default('default'),
  PORT: z.string().optional().default('3000'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(env: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    console.error('[panel/env] Invalid environment:', result.error.flatten());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}
