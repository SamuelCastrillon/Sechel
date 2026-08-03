import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  endSession,
  sessionEndSchema,
  type SessionEndInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemSessionSummary(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_session_summary',
    {
      description:
        'Save a comprehensive end-of-session summary. Call this when a session is ending or when significant work is complete.',
      inputSchema: sessionEndSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = resolveActor(extra, ctx);
        const parsed = sessionEndSchema.parse(args) as SessionEndInput;
        const result = await endSession(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
