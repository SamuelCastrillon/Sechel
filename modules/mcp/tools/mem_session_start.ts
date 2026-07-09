import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startSession, resolveDb, sessionStartSchema, type SessionStartInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemSessionStart(server: McpServer): void {
  server.registerTool(
    'mem_session_start',
    {
      description:
        'Register the start of a new coding session. Call this at the beginning of a session to track activity.',
      inputSchema: sessionStartSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = sessionStartSchema.parse(args) as SessionStartInput;
        const db = await resolveDb();
        const result = await startSession(db, actor, parsed);
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
