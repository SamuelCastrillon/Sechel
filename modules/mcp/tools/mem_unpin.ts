import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { unpinObservation, resolveDb, pinSchema, type PinInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemUnpin(server: McpServer): void {
  server.registerTool(
    'mem_unpin',
    {
      description:
        'Unpin a local observation so it only appears in normal recency order. Pinned state is local to this device and is not synced.',
      inputSchema: pinSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = pinSchema.parse(args) as PinInput;
        const db = await resolveDb();
        const result = await unpinObservation(db, actor, parsed);
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
