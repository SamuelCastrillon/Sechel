import type { APIRoute } from 'astro';
import { handleApiRequest, embeddedEnvFromLocals } from '../../server/index';

// Delegate all /api/* requests to the embedded @sechel/server Hono app.
// The app is created with the /api/admin prefix so admin routes match the
// panel's API_BASE (/api/admin). Non-admin paths fall through to Hono's 404.
export const prerender = false;

// Astro 5 supports the `ALL` export as a catch-all for any HTTP method.
//
// Env resolution per target:
// - Node (local dev) / Vercel: Astro loads .env into import.meta.env, so no
//   override is passed and resolveEmbeddedEnv() reads it from there.
// - Cloudflare: runtime bindings arrive via locals.runtime.env and are passed
//   through as the env override.
export const ALL: APIRoute = async ({ request, locals }) =>
  handleApiRequest(request, embeddedEnvFromLocals(locals as unknown as Record<string, unknown>));
