import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { suggestTopicKey, suggestTopicKeySchema, type SuggestTopicKeyInput } from '@/modules/core/domain';

export function registerMemSuggestTopicKey(server: McpServer): void {
  server.registerTool(
    'mem_suggest_topic_key',
    {
      description:
        'Suggest a stable topic_key for memory upserts. Use this before mem_save when you want evolving topics (like architecture decisions) to update a single observation over time.',
      inputSchema: suggestTopicKeySchema.shape,
    },
    async (args) => {
      try {
        const parsed = suggestTopicKeySchema.parse(args) as SuggestTopicKeyInput;
        const result = suggestTopicKey(parsed);
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
