import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  endSession,
  sessionEndSchema,
  actorFromAuthInfo,
  type SessionEndInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemSessionEnd(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_session_end',
    {
      description:
        'Mark a coding session as completed with an optional summary.',
      inputSchema: sessionEndSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = sessionEndSchema.parse(args) as SessionEndInput;
        const result = await endSession(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
