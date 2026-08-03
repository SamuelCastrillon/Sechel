import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  searchObservations,
  searchSchema,
  type SearchInput,
} from '@sechel-mcp/core';
import type { ToolContext } from './index.js';
import { ok, error } from './utils.js';
import { resolveActor } from './auth-wrapper.js';

export function registerMemSearch(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'mem_search',
    {
      description:
        'Search memories (Engram-compatible FTS5 bm25 ranking). Direct topic_key match when the query contains "/".',
      inputSchema: searchSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = resolveActor(extra, ctx);
        const parsed = searchSchema.parse(args) as SearchInput;
        const result = await searchObservations(ctx.db, ctx.tenantId, actor, parsed);
        return ok(result);
      } catch (e) {
        return error(e);
      }
    },
  );
}
