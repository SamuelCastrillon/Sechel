import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getTimeline,
  timelineSchema,
  actorFromAuthInfo,
  type TimelineInput,
} from '@sechel/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemTimeline(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_timeline',
    {
      description:
        'Get chronological neighborhood of an observation within the same session. Returns focus, before, and after entries.',
      inputSchema: timelineSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) return error('Unauthorized: missing or invalid token');
        const parsed = timelineSchema.parse(args) as TimelineInput;
        const result = await getTimeline(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
