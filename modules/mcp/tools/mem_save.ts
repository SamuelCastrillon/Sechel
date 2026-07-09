import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { saveObservation, resolveDb, saveSchema, type SaveInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemSave(server: McpServer): void {
  server.registerTool(
    'mem_save',
    {
      description:
        'Save a memory observation (Engram-compatible). Upserts by topic_key, dedupes within 15 min, and surfaces conflicts via judgment_required/candidates.',
      inputSchema: saveSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = saveSchema.parse(args) as SaveInput;
        const db = await resolveDb();
        const result = await saveObservation(db, actor, parsed);
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
