import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  judgeSchema,
  judgeRelation,
  type JudgeInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemJudge(server: McpServer, ctx: ToolContext): void {
  server.registerTool('mem_judge', {
    description:
      'Record a verdict on a pending memory conflict surfaced by mem_save.',
    inputSchema: judgeSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = resolveActor(extra, ctx);
      const parsed = judgeSchema.parse(args) as JudgeInput;
      const result = await judgeRelation(ctx.db, ctx.tenantId, actor, parsed);
      return ok(result);
    } catch (e) {
      return error(e);
    }
  });
}
