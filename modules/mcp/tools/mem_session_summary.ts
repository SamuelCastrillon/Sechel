import 'server-only';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { endSession, resolveDb, sessionEndSchema, type SessionEndInput } from '@/modules/core/domain';
import { actorFromAuthInfo } from '@/modules/core/auth';

export function registerMemSessionSummary(server: McpServer): void {
  server.registerTool(
    'mem_session_summary',
    {
      description:
        'Save a comprehensive end-of-session summary. Call this when a session is ending or when significant work is complete.',
      inputSchema: sessionEndSchema.shape,
    },
    async (args, extra) => {
      try {
        const actor = actorFromAuthInfo(extra.authInfo);
        if (!actor) throw new Error('Unauthorized: missing or invalid token');
        const parsed = sessionEndSchema.parse(args) as SessionEndInput;
        const db = await resolveDb();
        const result = await endSession(db, actor, parsed);
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
