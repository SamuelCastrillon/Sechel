import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  judgeSchema,
  judgeRelation,
  actorFromAuthInfo,
  type JudgeInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';

export function registerMemJudge(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_judge', {
    description:
      'Record a verdict on a pending memory conflict surfaced by mem_save.',
    inputSchema: judgeSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) return error('Unauthorized: missing or invalid token');
      const parsed = judgeSchema.parse(args) as JudgeInput;
      const result = await judgeRelation(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
