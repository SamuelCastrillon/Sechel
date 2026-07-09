import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveDb, compareSchema, type CompareInput } from '@/modules/core/domain';
import { compareMemories } from '@/modules/core/domain/store-relations';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemCompare(server: McpServer): void {
  server.registerTool('mem_compare', {
    description:
      'Persist a semantic verdict you have already judged externally (with your LLM) into Engram.',
    inputSchema: compareSchema.shape,
  }, async (args, extra) => {
    try {
      const actor = actorFromAuthInfo(extra.authInfo);
      if (!actor) throw new Error('Unauthorized: missing or invalid token');
      const parsed = compareSchema.parse(args) as CompareInput;
      const db = await resolveDb();
      const result = await compareMemories(db, actor, parsed);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
}
