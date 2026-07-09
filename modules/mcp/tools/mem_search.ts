import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchObservations, resolveDb, searchSchema, type SearchInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemSearch(server: McpServer): void {
  server.registerTool(
    'mem_search',
    {
      description:
        'Search memories (Engram-compatible FTS5 bm25 ranking). Direct topic_key match when the query contains "/".',
      inputSchema: searchSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = searchSchema.parse(args) as SearchInput;
        const db = await resolveDb();
        const result = await searchObservations(db, actor, parsed);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
