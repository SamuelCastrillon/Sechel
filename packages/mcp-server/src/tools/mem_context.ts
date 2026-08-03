import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getContext,
  contextSchema,
  type ContextInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemContext(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_context',
    {
      description:
        'Get recent memory context from previous sessions. Shows recent sessions, pinned observations, recent unpinned, and recent prompts.',
      inputSchema: contextSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = resolveActor(extra, ctx);
        const parsed = contextSchema.parse(args) as ContextInput;
        const result = await getContext(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
