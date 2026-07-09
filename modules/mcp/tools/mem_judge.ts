import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveDb, judgeSchema, type JudgeInput } from '@/modules/core/domain';
import { judgeRelation } from '@/modules/core/domain/store-relations';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemJudge(server: McpServer): void {
  server.registerTool('mem_judge', {
    description:
      'Record a verdict on a pending memory conflict surfaced by mem_save.',
    inputSchema: judgeSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) throw new Error('Unauthorized: missing or invalid token');
      const parsed = judgeSchema.parse(args) as JudgeInput;
      const db = await resolveDb();
      const result = await judgeRelation(db, actor, parsed);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
}
