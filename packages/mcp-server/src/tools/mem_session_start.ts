import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  startSession,
  sessionStartSchema,
  actorFromAuthInfo,
  type SessionStartInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemSessionStart(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_session_start',
    {
      description:
        'Register the start of a new coding session. Call this at the beginning of a session to track activity.',
      inputSchema: sessionStartSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = sessionStartSchema.parse(args) as SessionStartInput;
        const result = await startSession(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
