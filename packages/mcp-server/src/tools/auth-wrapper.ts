import { actorFromAuthInfo, type Actor } from '@sechel-mcp/core';
import type { ToolContext } from './index.js';

/**
 * Resolve the actor from the SDK's authInfo.
 *
 * When auth is required (ctx.authRequired === true) and no valid authInfo
 * is present, this throws an error that the caller's try/catch converts
 * into an error response.
 *
 * When auth is NOT required, missing authInfo yields a default CLI-user
 * actor so tools work in stdio mode without an OAuth handshake.
 */
export function resolveActor(extra: Record<string, unknown>, ctx: ToolContext): Actor {
  const actor = actorFromAuthInfo((extra as any)?.authInfo);
  if (!actor) {
    if (ctx.authRequired) {
      throw new Error('Unauthorized: missing or invalid token');
    }
    return { userId: 0, role: 'admin', username: 'cli-user' };
  }
  return actor;
}
