import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getTimeline,
  timelineSchema,
  type TimelineInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

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
        const actor = resolveActor(extra, ctx);
        const parsed = timelineSchema.parse(args) as TimelineInput;
        const result = await getTimeline(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
