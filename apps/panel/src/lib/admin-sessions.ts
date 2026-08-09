import { handleApiRequest, embeddedEnvFromLocals, type EmbeddedAppEnv } from '../server/index';
import { verifySessionToken, parseSessionCookie } from './session';
import type { AdminSession } from './types';

export interface AdminSessionsData {
  sessions: AdminSession[];
  /** sid of the access token that rendered this page ("this device" hint). */
  currentSessionId: string | null;
}

/**
 * Fetch the tenant's device sessions through the embedded server. The access
 * token is passed as the session cookie — the embedded server enforces its
 * own DB join (revoked rows → 401, SR-1) on top of the middleware's
 * crypto-only verify.
 *
 * Returns null when the session cannot render the page (401 revoked/stale,
 * 403 member, 5xx) — the caller bounces to /admin/login. No crash, no ugly
 * errors (U4 gate item (a)).
 */
export async function fetchAdminSessions(
  accessToken: string,
  env?: EmbeddedAppEnv,
): Promise<AdminSession[] | null> {
  const res = await handleApiRequest(
    new Request('http://localhost/api/admin/auth/sessions', {
      headers: { Cookie: `session=${accessToken}` },
    }),
    env,
  );
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { sessions?: AdminSession[] } | null;
  return Array.isArray(body?.sessions) ? (body.sessions as AdminSession[]) : null;
}

/**
 * SSR data loader for /admin/sessions. Uses the access token the middleware
 * verified/refreshed for this navigation (locals.sessionToken, set by
 * guardAdminRequest) when present — after a middleware refresh the browser
 * cookie is one rotation behind: it fails the embedded server's DB join, and
 * re-refreshing here would replay the old refresh cookie into the 60s reuse
 * grace (401). Falls back to the request cookie for direct loads.
 */
export async function loadAdminSessions(
  cookieHeader: string | null,
  locals: Record<string, unknown>,
): Promise<AdminSessionsData | null> {
  const env = embeddedEnvFromLocals(locals);
  const token = (locals.sessionToken as string | undefined) ?? parseSessionCookie(cookieHeader);
  if (!token) return null;

  const sessions = await fetchAdminSessions(token, env);
  if (!sessions) return null;

  const payload = await verifySessionToken(token, env?.JWT_SECRET);
  return { sessions, currentSessionId: payload?.sid ?? null };
}
