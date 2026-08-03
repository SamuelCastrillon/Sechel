import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getStats } from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemStats(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_stats',
    {
      description: 'Get counts and project list for the current tenant.',
      inputSchema: {},
    },
    async (_args, extra) => {
      try {
        const actor = resolveActor(extra, ctx);
        const result = await getStats(ctx.db, ctx.tenantId, actor);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
